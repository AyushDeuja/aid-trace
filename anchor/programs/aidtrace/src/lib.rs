use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;

use constants::*;
use errors::AidTraceError;
use events::*;
use state::*;

declare_id!("FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M");

#[program]
pub mod aidtrace {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        initialize_global_config(
            &mut *ctx.accounts.config,
            ctx.accounts.deployer.key(),
            ctx.bumps.config,
        );

        emit!(ConfigInitialized {
            config: ctx.accounts.config.key(),
            admin: ctx.accounts.config.admin,
            treasury_authority: ctx.accounts.config.treasury_authority,
            protocol_version: ctx.accounts.config.protocol_version,
            occurred_at: now,
        });
        Ok(())
    }

    pub fn register_organization(
        ctx: Context<RegisterOrganization>,
        metadata_digest: [u8; 32],
    ) -> Result<()> {
        validate_digest(&metadata_digest)?;
        let now = Clock::get()?.unix_timestamp;
        initialize_organization(
            &mut *ctx.accounts.organization,
            ctx.accounts.authority.key(),
            metadata_digest,
            ctx.bumps.organization,
        );

        emit!(OrganizationRegistered {
            organization: ctx.accounts.organization.key(),
            founder: ctx.accounts.authority.key(),
            authority: ctx.accounts.authority.key(),
            metadata_digest,
            occurred_at: now,
        });
        Ok(())
    }

    pub fn update_organization_metadata(
        ctx: Context<ManageOrganization>,
        metadata_digest: [u8; 32],
    ) -> Result<()> {
        validate_digest(&metadata_digest)?;
        require!(
            ctx.accounts.organization.status != OrganizationStatus::Closed,
            AidTraceError::InvalidStatusTransition
        );
        require!(
            ctx.accounts.organization.metadata_digest != metadata_digest,
            AidTraceError::InvalidInput
        );
        ctx.accounts.organization.metadata_digest = metadata_digest;
        invalidate_approval(&mut ctx.accounts.organization, ctx.accounts.authority.key())?;
        emit!(OrganizationMetadataUpdated {
            organization: ctx.accounts.organization.key(),
            actor: ctx.accounts.authority.key(),
            metadata_digest,
            occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn nominate_organization_authority(
        ctx: Context<ManageOrganization>,
        pending_authority: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.organization.status != OrganizationStatus::Closed,
            AidTraceError::InvalidStatusTransition
        );
        nominate_authority(&mut ctx.accounts.organization, pending_authority)?;
        emit!(OrganizationAuthorityNominated {
            organization: ctx.accounts.organization.key(),
            authority: ctx.accounts.authority.key(),
            pending_authority,
            occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn accept_organization_authority(ctx: Context<AcceptOrganizationAuthority>) -> Result<()> {
        let organization = &mut ctx.accounts.organization;
        require!(
            organization.status != OrganizationStatus::Closed,
            AidTraceError::InvalidStatusTransition
        );
        let previous_authority = accept_authority(organization, ctx.accounts.new_authority.key())?;
        invalidate_approval(organization, ctx.accounts.new_authority.key())?;
        emit!(OrganizationAuthorityTransferred {
            organization: organization.key(),
            previous_authority,
            authority: organization.authority,
            occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn set_organization_verified(
        ctx: Context<AdminOrganization>,
        verified: bool,
    ) -> Result<()> {
        let organization = &mut ctx.accounts.organization;
        require!(
            organization.status != OrganizationStatus::Closed,
            AidTraceError::InvalidStatusTransition
        );
        apply_verification(organization, verified)?;
        if !verified && organization.status == OrganizationStatus::Active {
            organization.status = OrganizationStatus::Suspended;
            emit!(OrganizationStatusChanged {
                organization: organization.key(),
                actor: ctx.accounts.admin.key(),
                previous_status: OrganizationStatusEvent::Active,
                next_status: OrganizationStatusEvent::Suspended,
                occurred_at: Clock::get()?.unix_timestamp,
            });
        }
        emit!(OrganizationVerificationChanged {
            organization: organization.key(),
            actor: ctx.accounts.admin.key(),
            verified,
            occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn set_organization_status(
        ctx: Context<AdminOrganization>,
        next_status: OrganizationStatus,
    ) -> Result<()> {
        let organization = &mut ctx.accounts.organization;
        let previous_status = organization.status;
        apply_status_change(organization, next_status)?;
        emit!(OrganizationStatusChanged {
            organization: organization.key(),
            actor: ctx.accounts.admin.key(),
            previous_status: organization_status_event(previous_status),
            next_status: organization_status_event(next_status),
            occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: u64,
        target_amount: u64,
        ends_at: Option<i64>,
        evidence_digest: [u8; 32],
        metadata_uri: String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, AidTraceError::ProtocolPaused);
        require!(
            ctx.accounts.organization.status == OrganizationStatus::Active
                && ctx.accounts.organization.verified,
            AidTraceError::OrganizationNotActive
        );
        require_authority(
            ctx.accounts.organization.authority,
            ctx.accounts.authority.key(),
        )?;
        require!(
            campaign_id == ctx.accounts.organization.next_campaign_id,
            AidTraceError::InvalidSequence
        );
        require!(target_amount > 0, AidTraceError::InvalidAmount);
        validate_digest(&evidence_digest)?;
        validate_campaign_uri(&metadata_uri)?;

        let now = Clock::get()?.unix_timestamp;
        if let Some(end) = ends_at {
            require!(end > now, AidTraceError::InvalidInput);
        }

        initialize_campaign(
            &mut *ctx.accounts.campaign,
            ctx.accounts.organization.key(),
            ctx.accounts.authority.key(),
            campaign_id,
            target_amount,
            ends_at,
            evidence_digest,
            metadata_uri,
            now,
            ctx.bumps.campaign,
        );
        ctx.accounts.vault.campaign = ctx.accounts.campaign.key();
        ctx.accounts.vault.bump = ctx.bumps.vault;
        ctx.accounts.organization.next_campaign_id = ctx
            .accounts
            .organization
            .next_campaign_id
            .checked_add(1)
            .ok_or(AidTraceError::CounterExhausted)?;

        emit!(CampaignCreated {
            campaign: ctx.accounts.campaign.key(),
            organization: ctx.accounts.organization.key(),
            authority: ctx.accounts.authority.key(),
            campaign_id,
            status: CampaignStatusEvent::Draft,
            occurred_at: now,
        });
        Ok(())
    }

    pub fn update_campaign(
        ctx: Context<ManageCampaign>,
        target_amount: u64,
        ends_at: Option<i64>,
        evidence_digest: [u8; 32],
        metadata_uri: String,
    ) -> Result<()> {
        require!(
            matches!(
                ctx.accounts.campaign.status,
                CampaignStatus::Draft | CampaignStatus::PendingReview | CampaignStatus::Paused
            ),
            AidTraceError::InvalidStatusTransition
        );
        require!(
            target_amount > 0 && target_amount >= ctx.accounts.campaign.amount_raised,
            AidTraceError::InvalidAmount
        );
        validate_digest(&evidence_digest)?;
        validate_campaign_uri(&metadata_uri)?;
        if let Some(end) = ends_at {
            require!(
                end > Clock::get()?.unix_timestamp,
                AidTraceError::InvalidInput
            );
        }
        let campaign = &mut ctx.accounts.campaign;
        let previous_status = campaign.status;
        campaign.target_amount = target_amount;
        campaign.ends_at = ends_at;
        campaign.evidence_digest = evidence_digest;
        campaign.metadata_uri = metadata_uri;
        campaign.status = CampaignStatus::Draft;
        emit!(CampaignUpdated {
            campaign: campaign.key(),
            actor: ctx.accounts.authority.key(),
            target_amount,
            metadata_digest: evidence_digest,
            occurred_at: Clock::get()?.unix_timestamp
        });
        if previous_status != CampaignStatus::Draft {
            emit!(CampaignStatusChanged {
                campaign: campaign.key(),
                actor: ctx.accounts.authority.key(),
                previous_status: campaign_status_event(previous_status),
                next_status: CampaignStatusEvent::Draft,
                occurred_at: Clock::get()?.unix_timestamp
            });
        }
        Ok(())
    }

    pub fn submit_campaign(ctx: Context<ManageCampaign>) -> Result<()> {
        require!(
            ctx.accounts.campaign.status == CampaignStatus::Draft,
            AidTraceError::InvalidStatusTransition
        );
        ctx.accounts.campaign.status = CampaignStatus::PendingReview;
        emit!(CampaignStatusChanged {
            campaign: ctx.accounts.campaign.key(),
            actor: ctx.accounts.authority.key(),
            previous_status: CampaignStatusEvent::Draft,
            next_status: CampaignStatusEvent::PendingReview,
            occurred_at: Clock::get()?.unix_timestamp
        });
        Ok(())
    }

    pub fn set_campaign_status(
        ctx: Context<AdminCampaign>,
        next_status: CampaignStatus,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let previous = campaign.status;
        require!(
            campaign_status_transition_allowed(previous, next_status),
            AidTraceError::InvalidStatusTransition
        );
        if next_status == CampaignStatus::Active {
            require!(!ctx.accounts.config.paused, AidTraceError::ProtocolPaused);
            require!(
                ctx.accounts.organization.verified
                    && ctx.accounts.organization.status == OrganizationStatus::Active,
                AidTraceError::OrganizationNotActive
            );
            if let Some(end) = campaign.ends_at {
                require!(
                    end > Clock::get()?.unix_timestamp,
                    AidTraceError::InvalidInput
                );
            }
        }
        campaign.status = next_status;
        emit!(CampaignStatusChanged {
            campaign: campaign.key(),
            actor: ctx.accounts.admin.key(),
            previous_status: campaign_status_event(previous),
            next_status: campaign_status_event(next_status),
            occurred_at: Clock::get()?.unix_timestamp
        });
        Ok(())
    }

    pub fn donate(ctx: Context<Donate>, amount: u64, donation_id: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, AidTraceError::ProtocolPaused);
        require!(
            ctx.accounts.organization.verified
                && ctx.accounts.organization.status == OrganizationStatus::Active,
            AidTraceError::OrganizationNotActive
        );
        require!(
            ctx.accounts.campaign.status == CampaignStatus::Active,
            AidTraceError::InvalidStatusTransition
        );
        require!(amount > 0, AidTraceError::InvalidAmount);
        if let Some(end) = ctx.accounts.campaign.ends_at {
            require!(
                end > Clock::get()?.unix_timestamp,
                AidTraceError::InvalidInput
            );
        }
        require!(
            donation_id == ctx.accounts.campaign.next_donation_id,
            AidTraceError::InvalidSequence
        );
        let total = ctx
            .accounts
            .campaign
            .amount_raised
            .checked_add(amount)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        let next = donation_id
            .checked_add(1)
            .ok_or(AidTraceError::CounterExhausted)?;
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.donor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;
        let donation = &mut ctx.accounts.donation;
        donation.campaign = ctx.accounts.campaign.key();
        donation.donor = ctx.accounts.donor.key();
        donation.donation_id = donation_id;
        donation.amount = amount;
        donation.source = DonationSource::Standard;
        donation.occurred_at = Clock::get()?.unix_timestamp;
        donation.bump = ctx.bumps.donation;
        ctx.accounts.campaign.amount_raised = total;
        ctx.accounts.campaign.next_donation_id = next;
        emit!(DonationReceived {
            donation: donation.key(),
            campaign: donation.campaign,
            donor: donation.donor,
            amount,
            sequence: donation_id,
            source: DonationSource::Standard,
            occurred_at: donation.occurred_at
        });
        Ok(())
    }

    pub fn create_allocation(
        ctx: Context<CreateAllocation>,
        allocation_id: u64,
        recipient: Pubkey,
        amount: u64,
        purpose_digest: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, AidTraceError::ProtocolPaused);
        require!(
            ctx.accounts.organization.verified
                && ctx.accounts.organization.status == OrganizationStatus::Active,
            AidTraceError::OrganizationNotActive
        );
        require!(
            ctx.accounts.campaign.status == CampaignStatus::Active,
            AidTraceError::InvalidStatusTransition
        );
        require!(amount > 0, AidTraceError::InvalidAmount);
        validate_digest(&purpose_digest)?;
        require!(recipient != Pubkey::default(), AidTraceError::InvalidInput);
        require!(
            allocation_id == ctx.accounts.campaign.next_allocation_id,
            AidTraceError::InvalidSequence
        );
        let available = available_funds(&ctx.accounts.campaign)?;
        require!(amount <= available, AidTraceError::InsufficientAvailableFunds);

        let now = Clock::get()?.unix_timestamp;
        let allocation = &mut ctx.accounts.allocation;
        allocation.campaign = ctx.accounts.campaign.key();
        allocation.allocation_id = allocation_id;
        allocation.recipient = recipient;
        allocation.amount = amount;
        allocation.spent = 0;
        allocation.purpose_digest = purpose_digest;
        allocation.created_at = now;
        allocation.status = AllocationStatus::Open;
        allocation.next_disbursement_id = 0;
        allocation.bump = ctx.bumps.allocation;

        let campaign = &mut ctx.accounts.campaign;
        campaign.amount_reserved = campaign
            .amount_reserved
            .checked_add(amount)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        campaign.next_allocation_id = campaign
            .next_allocation_id
            .checked_add(1)
            .ok_or(AidTraceError::CounterExhausted)?;
        emit!(AllocationCreated {
            allocation: allocation.key(),
            campaign: campaign.key(),
            actor: ctx.accounts.authority.key(),
            allocation_id,
            amount,
            recipient,
            purpose_digest,
            occurred_at: now,
        });
        Ok(())
    }

    pub fn cancel_allocation(ctx: Context<ManageAllocation>) -> Result<()> {
        require!(
            ctx.accounts.allocation.status == AllocationStatus::Open,
            AidTraceError::InvalidStatusTransition
        );
        let released_amount = ctx
            .accounts
            .allocation
            .amount
            .checked_sub(ctx.accounts.allocation.spent)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        ctx.accounts.campaign.amount_reserved = ctx
            .accounts
            .campaign
            .amount_reserved
            .checked_sub(released_amount)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        ctx.accounts.allocation.status = AllocationStatus::Cancelled;
        emit!(AllocationCancelled {
            allocation: ctx.accounts.allocation.key(),
            campaign: ctx.accounts.campaign.key(),
            actor: ctx.accounts.authority.key(),
            released_amount,
            occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn record_disbursement(
        ctx: Context<RecordDisbursement>,
        disbursement_id: u64,
        amount: u64,
        description_digest: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, AidTraceError::ProtocolPaused);
        require!(
            ctx.accounts.organization.verified
                && ctx.accounts.organization.status == OrganizationStatus::Active,
            AidTraceError::OrganizationNotActive
        );
        require!(
            ctx.accounts.campaign.status == CampaignStatus::Active,
            AidTraceError::InvalidStatusTransition
        );
        require!(
            ctx.accounts.allocation.status == AllocationStatus::Open,
            AidTraceError::InvalidStatusTransition
        );
        require!(amount > 0, AidTraceError::InvalidAmount);
        validate_digest(&description_digest)?;
        require!(
            ctx.accounts.recipient.key() == ctx.accounts.allocation.recipient,
            AidTraceError::InvalidInput
        );
        require!(
            disbursement_id == ctx.accounts.allocation.next_disbursement_id,
            AidTraceError::InvalidSequence
        );
        let remaining = ctx
            .accounts
            .allocation
            .amount
            .checked_sub(ctx.accounts.allocation.spent)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        require!(amount <= remaining, AidTraceError::InsufficientAllocationFunds);
        let rent_floor = Rent::get()?.minimum_balance(CampaignVault::SPACE);
        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        require!(
            vault_lamports >= rent_floor.saturating_add(amount),
            AidTraceError::InsufficientAvailableFunds
        );

        let now = Clock::get()?.unix_timestamp;
        {
            let vault_info = ctx.accounts.vault.to_account_info();
            let mut vault_lamports = vault_info.try_borrow_mut_lamports()?;
            **vault_lamports = (**vault_lamports)
                .checked_sub(amount)
                .ok_or(AidTraceError::ArithmeticOverflow)?;
        }
        {
            let recipient_info = ctx.accounts.recipient.to_account_info();
            let mut recipient_lamports = recipient_info.try_borrow_mut_lamports()?;
            **recipient_lamports = (**recipient_lamports)
                .checked_add(amount)
                .ok_or(AidTraceError::ArithmeticOverflow)?;
        }
        let allocation = &mut ctx.accounts.allocation;
        allocation.spent = allocation
            .spent
            .checked_add(amount)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        allocation.next_disbursement_id = allocation
            .next_disbursement_id
            .checked_add(1)
            .ok_or(AidTraceError::CounterExhausted)?;
        let campaign = &mut ctx.accounts.campaign;
        campaign.amount_reserved = campaign
            .amount_reserved
            .checked_sub(amount)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        campaign.amount_disbursed = campaign
            .amount_disbursed
            .checked_add(amount)
            .ok_or(AidTraceError::ArithmeticOverflow)?;
        let disbursement = &mut ctx.accounts.disbursement;
        disbursement.allocation = allocation.key();
        disbursement.campaign = campaign.key();
        disbursement.disbursement_id = disbursement_id;
        disbursement.recipient = ctx.accounts.recipient.key();
        disbursement.amount = amount;
        disbursement.evidence_digest = description_digest;
        disbursement.created_at = now;
        disbursement.authority = ctx.accounts.authority.key();
        disbursement.status = DisbursementStatus::Recorded;
        disbursement.next_delivery_verification_id = 0;
        disbursement.bump = ctx.bumps.disbursement;
        emit!(DisbursementRecorded {
            disbursement: disbursement.key(),
            allocation: allocation.key(),
            campaign: campaign.key(),
            actor: ctx.accounts.authority.key(),
            disbursement_id,
            amount,
            recipient: ctx.accounts.recipient.key(),
            description_digest,
            occurred_at: now,
        });
        Ok(())
    }

    pub fn register_verifier(ctx: Context<RegisterVerifier>, verifier: Pubkey) -> Result<()> {
        require!(verifier != Pubkey::default(), AidTraceError::InvalidInput);
        let record = &mut ctx.accounts.verifier_record;
        record.organization = ctx.accounts.organization.key();
        record.verifier = verifier;
        record.active = true;
        record.bump = ctx.bumps.verifier_record;
        emit!(VerifierRegistered {
            verifier_record: record.key(), organization: record.organization, verifier,
            actor: ctx.accounts.authority.key(), occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn revoke_verifier(ctx: Context<RevokeVerifier>) -> Result<()> {
        let record = &mut ctx.accounts.verifier_record;
        require!(record.active, AidTraceError::InvalidStatusTransition);
        record.active = false;
        emit!(VerifierRevoked {
            verifier_record: record.key(), organization: record.organization,
            verifier: record.verifier, actor: ctx.accounts.authority.key(),
            occurred_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn verify_delivery(
        ctx: Context<VerifyDelivery>,
        verification_id: u64,
        evidence_digest: [u8; 32],
        status: VerificationStatus,
    ) -> Result<()> {
        require!(ctx.accounts.organization.verified && ctx.accounts.organization.status == OrganizationStatus::Active, AidTraceError::OrganizationNotActive);
        require!(ctx.accounts.verifier_record.active, AidTraceError::Unauthorized);
        require!(verification_id == ctx.accounts.disbursement.next_delivery_verification_id, AidTraceError::InvalidSequence);
        require!(matches!(status, VerificationStatus::Verified | VerificationStatus::Disputed | VerificationStatus::Rejected), AidTraceError::InvalidStatusTransition);
        validate_digest(&evidence_digest)?;
        let now = Clock::get()?.unix_timestamp;
        let verification = &mut ctx.accounts.verification;
        verification.disbursement = ctx.accounts.disbursement.key();
        verification.verification_id = verification_id;
        verification.verifier = ctx.accounts.verifier.key();
        verification.evidence_digest = evidence_digest;
        verification.status = status;
        verification.verified_at = Some(now);
        verification.bump = ctx.bumps.verification;
        let disbursement = &mut ctx.accounts.disbursement;
        disbursement.next_delivery_verification_id = disbursement.next_delivery_verification_id.checked_add(1).ok_or(AidTraceError::CounterExhausted)?;
        disbursement.status = match status {
            VerificationStatus::Verified => DisbursementStatus::Verified,
            VerificationStatus::Disputed => DisbursementStatus::Disputed,
            VerificationStatus::Rejected => DisbursementStatus::Rejected,
            VerificationStatus::Pending => return err!(AidTraceError::InvalidStatusTransition),
        };
        if status == VerificationStatus::Verified {
            ctx.accounts.organization.verified_delivery_count = ctx.accounts.organization.verified_delivery_count.checked_add(1).ok_or(AidTraceError::CounterExhausted)?;
        }
        emit!(DeliveryVerified {
            verification: verification.key(), disbursement: verification.disbursement,
            verifier: verification.verifier, verification_id, evidence_digest,
            status: verification_status_event(status), occurred_at: now,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = deployer,
        space = GlobalConfig::SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub deployer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(metadata_digest: [u8; 32])]
pub struct RegisterOrganization<'info> {
    #[account(
        init,
        payer = authority,
        space = Organization::SPACE,
        seeds = [ORGANIZATION_SEED, authority.key().as_ref()],
        bump
    )]
    pub organization: Account<'info, Organization>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageOrganization<'info> {
    #[account(mut, seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump, has_one = authority @ AidTraceError::Unauthorized)]
    pub organization: Account<'info, Organization>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptOrganizationAuthority<'info> {
    #[account(mut, seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump)]
    pub organization: Account<'info, Organization>,
    pub new_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOrganization<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AidTraceError::Unauthorized)]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump)]
    pub organization: Account<'info, Organization>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateCampaign<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [ORGANIZATION_SEED, organization.founder.as_ref()],
        bump = organization.bump,
        has_one = authority @ AidTraceError::Unauthorized
    )]
    pub organization: Account<'info, Organization>,
    #[account(
        init,
        payer = authority,
        space = Campaign::SPACE,
        seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(init, payer = authority, space = CampaignVault::SPACE, seeds = [CAMPAIGN_VAULT_SEED, campaign.key().as_ref()], bump)]
    pub vault: Account<'info, CampaignVault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageCampaign<'info> {
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump, has_one = authority @ AidTraceError::Unauthorized)]
    pub organization: Account<'info, Organization>,
    #[account(mut, seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump, has_one = organization)]
    pub campaign: Account<'info, Campaign>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminCampaign<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AidTraceError::Unauthorized)]
    pub config: Account<'info, GlobalConfig>,
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump)]
    pub organization: Account<'info, Organization>,
    #[account(mut, seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump, has_one = organization)]
    pub campaign: Account<'info, Campaign>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, donation_id: u64)]
pub struct Donate<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump)]
    pub organization: Account<'info, Organization>,
    #[account(mut, seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump, has_one = organization)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [CAMPAIGN_VAULT_SEED, campaign.key().as_ref()], bump = vault.bump, has_one = campaign)]
    pub vault: Account<'info, CampaignVault>,
    #[account(init, payer = donor, space = Donation::SPACE, seeds = [DONATION_SEED, campaign.key().as_ref(), &donation_id.to_le_bytes()], bump)]
    pub donation: Account<'info, Donation>,
    #[account(mut)]
    pub donor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(allocation_id: u64)]
pub struct CreateAllocation<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump, has_one = authority @ AidTraceError::Unauthorized)]
    pub organization: Account<'info, Organization>,
    #[account(mut, seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump, has_one = organization)]
    pub campaign: Account<'info, Campaign>,
    #[account(init, payer = authority, space = Allocation::SPACE, seeds = [ALLOCATION_SEED, campaign.key().as_ref(), &allocation_id.to_le_bytes()], bump)]
    pub allocation: Account<'info, Allocation>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageAllocation<'info> {
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump, has_one = authority @ AidTraceError::Unauthorized)]
    pub organization: Account<'info, Organization>,
    #[account(mut, seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump, has_one = organization)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [ALLOCATION_SEED, campaign.key().as_ref(), &allocation.allocation_id.to_le_bytes()], bump = allocation.bump, has_one = campaign)]
    pub allocation: Account<'info, Allocation>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(disbursement_id: u64)]
pub struct RecordDisbursement<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump, has_one = authority @ AidTraceError::Unauthorized)]
    pub organization: Account<'info, Organization>,
    #[account(mut, seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump, has_one = organization)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [CAMPAIGN_VAULT_SEED, campaign.key().as_ref()], bump = vault.bump, has_one = campaign)]
    pub vault: Account<'info, CampaignVault>,
    #[account(mut, seeds = [ALLOCATION_SEED, campaign.key().as_ref(), &allocation.allocation_id.to_le_bytes()], bump = allocation.bump, has_one = campaign)]
    pub allocation: Box<Account<'info, Allocation>>,
    #[account(init, payer = authority, space = Disbursement::SPACE, seeds = [DISBURSEMENT_SEED, allocation.key().as_ref(), &disbursement_id.to_le_bytes()], bump)]
    pub disbursement: Box<Account<'info, Disbursement>>,
    /// CHECK: the instruction verifies this key equals `allocation.recipient`;
    /// it receives lamports only and is never deserialized or owned by this program.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(verifier: Pubkey)]
pub struct RegisterVerifier<'info> {
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump, has_one = authority @ AidTraceError::Unauthorized)]
    pub organization: Box<Account<'info, Organization>>,
    // Re-registration is intentional: only the organization authority can reactivate a revoked record.
    #[account(init_if_needed, payer = authority, space = Verifier::SPACE, seeds = [VERIFIER_SEED, organization.key().as_ref(), verifier.as_ref()], bump)]
    pub verifier_record: Account<'info, Verifier>,
    #[account(mut)] pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeVerifier<'info> {
    #[account(seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump, has_one = authority @ AidTraceError::Unauthorized)]
    pub organization: Account<'info, Organization>,
    #[account(mut, seeds = [VERIFIER_SEED, organization.key().as_ref(), verifier_record.verifier.as_ref()], bump = verifier_record.bump, has_one = organization)]
    pub verifier_record: Account<'info, Verifier>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(verification_id: u64)]
pub struct VerifyDelivery<'info> {
    #[account(mut, seeds = [ORGANIZATION_SEED, organization.founder.as_ref()], bump = organization.bump)]
    pub organization: Box<Account<'info, Organization>>,
    #[account(seeds = [CAMPAIGN_SEED, organization.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump, has_one = organization)]
    pub campaign: Account<'info, Campaign>,
    #[account(seeds = [ALLOCATION_SEED, campaign.key().as_ref(), &allocation.allocation_id.to_le_bytes()], bump = allocation.bump, has_one = campaign)]
    pub allocation: Box<Account<'info, Allocation>>,
    #[account(mut, seeds = [DISBURSEMENT_SEED, allocation.key().as_ref(), &disbursement.disbursement_id.to_le_bytes()], bump = disbursement.bump, has_one = campaign, has_one = allocation)]
    pub disbursement: Box<Account<'info, Disbursement>>,
    #[account(seeds = [VERIFIER_SEED, organization.key().as_ref(), verifier.key().as_ref()], bump = verifier_record.bump, has_one = organization, has_one = verifier @ AidTraceError::Unauthorized)]
    pub verifier_record: Box<Account<'info, Verifier>>,
    #[account(init, payer = verifier, space = DeliveryVerification::SPACE, seeds = [DELIVERY_VERIFICATION_SEED, disbursement.key().as_ref(), &verification_id.to_le_bytes()], bump)]
    pub verification: Box<Account<'info, DeliveryVerification>>,
    #[account(mut)] pub verifier: Signer<'info>,
    pub system_program: Program<'info, System>,
}

fn campaign_status_event(status: CampaignStatus) -> CampaignStatusEvent {
    match status {
        CampaignStatus::Draft => CampaignStatusEvent::Draft,
        CampaignStatus::PendingReview => CampaignStatusEvent::PendingReview,
        CampaignStatus::Active => CampaignStatusEvent::Active,
        CampaignStatus::Paused => CampaignStatusEvent::Paused,
        CampaignStatus::Closed => CampaignStatusEvent::Closed,
    }
}

fn verification_status_event(status: VerificationStatus) -> VerificationStatusEvent {
    match status {
        VerificationStatus::Pending => VerificationStatusEvent::Pending,
        VerificationStatus::Verified => VerificationStatusEvent::Verified,
        VerificationStatus::Disputed => VerificationStatusEvent::Disputed,
        VerificationStatus::Rejected => VerificationStatusEvent::Rejected,
    }
}

fn available_funds(campaign: &Campaign) -> Result<u64> {
    campaign
        .amount_raised
        .checked_sub(campaign.amount_disbursed)
        .and_then(|value| value.checked_sub(campaign.amount_reserved))
        .ok_or_else(|| error!(AidTraceError::ArithmeticOverflow))
}

fn campaign_status_transition_allowed(previous: CampaignStatus, next: CampaignStatus) -> bool {
    matches!(
        (previous, next),
        (CampaignStatus::PendingReview, CampaignStatus::Active)
            | (CampaignStatus::Active, CampaignStatus::Paused)
            | (CampaignStatus::Paused, CampaignStatus::Active)
            | (CampaignStatus::Active, CampaignStatus::Closed)
            | (CampaignStatus::Paused, CampaignStatus::Closed)
            | (CampaignStatus::PendingReview, CampaignStatus::Closed)
    )
}

fn validate_campaign_uri(uri: &str) -> Result<()> {
    let prefix = "aidtrace://campaign/";
    let id = uri.strip_prefix(prefix).unwrap_or("");
    let valid_uuid = id.len() == 36
        && id.chars().enumerate().all(|(index, character)| {
            if [8, 13, 18, 23].contains(&index) {
                character == '-'
            } else {
                character.is_ascii_hexdigit() && !character.is_ascii_uppercase()
            }
        });
    require!(
        uri.len() <= 500
            && valid_uuid,
        AidTraceError::InvalidInput
    );
    Ok(())
}

fn initialize_global_config(config: &mut GlobalConfig, deployer: Pubkey, bump: u8) {
    config.admin = deployer;
    config.treasury_authority = deployer;
    config.fraud_threshold = DEFAULT_FRAUD_THRESHOLD;
    config.paused = false;
    config.protocol_version = PROTOCOL_VERSION;
    config.bump = bump;
}

fn initialize_organization(
    organization: &mut Organization,
    authority: Pubkey,
    metadata_digest: [u8; 32],
    bump: u8,
) {
    organization.founder = authority;
    organization.authority = authority;
    organization.pending_authority = None;
    organization.metadata_digest = metadata_digest;
    organization.status = OrganizationStatus::Pending;
    organization.verified = false;
    organization.verified_delivery_count = 0;
    organization.next_campaign_id = 0;
    organization.bump = bump;
}

fn organization_status_event(status: OrganizationStatus) -> OrganizationStatusEvent {
    match status {
        OrganizationStatus::Pending => OrganizationStatusEvent::Pending,
        OrganizationStatus::Active => OrganizationStatusEvent::Active,
        OrganizationStatus::Suspended => OrganizationStatusEvent::Suspended,
        OrganizationStatus::Closed => OrganizationStatusEvent::Closed,
    }
}

fn nominate_authority(organization: &mut Organization, next: Pubkey) -> Result<()> {
    require!(
        next != Pubkey::default()
            && next != organization.authority
            && organization.pending_authority != Some(next),
        AidTraceError::InvalidAuthorityTransfer
    );
    organization.pending_authority = Some(next);
    Ok(())
}

fn accept_authority(organization: &mut Organization, next: Pubkey) -> Result<Pubkey> {
    require!(
        organization.pending_authority == Some(next),
        AidTraceError::InvalidAuthorityTransfer
    );
    let previous = organization.authority;
    organization.authority = next;
    organization.pending_authority = None;
    Ok(previous)
}

fn apply_verification(organization: &mut Organization, verified: bool) -> Result<()> {
    require!(
        organization.verified != verified,
        AidTraceError::InvalidStatusTransition
    );
    organization.verified = verified;
    Ok(())
}

fn apply_status_change(organization: &mut Organization, next: OrganizationStatus) -> Result<()> {
    require!(
        organization.status != OrganizationStatus::Closed
            && organization.status != next
            && next != OrganizationStatus::Pending,
        AidTraceError::InvalidStatusTransition
    );
    if next == OrganizationStatus::Active {
        require!(
            organization.verified,
            AidTraceError::OrganizationNotVerified
        );
    }
    organization.status = next;
    if next == OrganizationStatus::Closed {
        organization.pending_authority = None;
    }
    Ok(())
}

fn invalidate_approval(organization: &mut Account<Organization>, actor: Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    if organization.verified {
        organization.verified = false;
        emit!(OrganizationVerificationChanged {
            organization: organization.key(),
            actor,
            verified: false,
            occurred_at: now,
        });
    }
    if organization.status == OrganizationStatus::Active {
        organization.status = OrganizationStatus::Suspended;
        emit!(OrganizationStatusChanged {
            organization: organization.key(),
            actor,
            previous_status: OrganizationStatusEvent::Active,
            next_status: OrganizationStatusEvent::Suspended,
            occurred_at: now,
        });
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn initialize_campaign(
    campaign: &mut Campaign,
    organization: Pubkey,
    authority: Pubkey,
    campaign_id: u64,
    target_amount: u64,
    ends_at: Option<i64>,
    evidence_digest: [u8; 32],
    metadata_uri: String,
    created_at: i64,
    bump: u8,
) {
    campaign.organization = organization;
    campaign.authority = authority;
    campaign.campaign_id = campaign_id;
    campaign.target_amount = target_amount;
    campaign.amount_raised = 0;
    campaign.amount_disbursed = 0;
    campaign.amount_reserved = 0;
    campaign.status = CampaignStatus::Draft;
    campaign.created_at = created_at;
    campaign.ends_at = ends_at;
    campaign.evidence_digest = evidence_digest;
    campaign.metadata_uri = metadata_uri;
    campaign.next_donation_id = 0;
    campaign.next_allocation_id = 0;
    campaign.bump = bump;
}

fn validate_digest(digest: &[u8; 32]) -> Result<()> {
    require!(
        digest.iter().any(|byte| *byte != 0),
        AidTraceError::InvalidDigest
    );
    Ok(())
}

fn require_authority(expected: Pubkey, actual: Pubkey) -> Result<()> {
    require_keys_eq!(expected, actual, AidTraceError::Unauthorized);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest() -> [u8; 32] {
        [7; 32]
    }

    #[test]
    fn pda_derivations_are_deterministic() {
        let authority = Pubkey::new_unique();
        let (organization, _) =
            Pubkey::find_program_address(&[ORGANIZATION_SEED, authority.as_ref()], &crate::ID);
        let (same_organization, _) =
            Pubkey::find_program_address(&[ORGANIZATION_SEED, authority.as_ref()], &crate::ID);
        let (campaign, _) = Pubkey::find_program_address(
            &[CAMPAIGN_SEED, organization.as_ref(), &0_u64.to_le_bytes()],
            &crate::ID,
        );

        assert_eq!(organization, same_organization);
        assert_ne!(organization, campaign);
    }

    #[test]
    fn initialization_helpers_set_canonical_defaults() {
        let authority = Pubkey::new_unique();
        let organization_key = Pubkey::new_unique();
        let mut config = GlobalConfig {
            admin: Pubkey::default(),
            treasury_authority: Pubkey::default(),
            fraud_threshold: 0,
            paused: true,
            protocol_version: 0,
            bump: 0,
        };
        let mut organization = Organization {
            founder: Pubkey::default(),
            authority: Pubkey::default(),
            pending_authority: None,
            metadata_digest: [0; 32],
            status: OrganizationStatus::Suspended,
            verified: true,
            verified_delivery_count: 99,
            next_campaign_id: 99,
            bump: 0,
        };
        let mut campaign = Campaign {
            organization: Pubkey::default(),
            authority: Pubkey::default(),
            campaign_id: 99,
            target_amount: 0,
            amount_raised: 1,
            amount_disbursed: 1,
            amount_reserved: 1,
            status: CampaignStatus::Closed,
            created_at: 0,
            ends_at: None,
            evidence_digest: [0; 32],
            metadata_uri: String::new(),
            next_donation_id: 99,
            next_allocation_id: 99,
            bump: 0,
        };

        initialize_global_config(&mut config, authority, 1);
        initialize_organization(&mut organization, authority, digest(), 2);
        initialize_campaign(
            &mut campaign,
            organization_key,
            authority,
            0,
            1_000,
            Some(100),
            digest(),
            "aidtrace://campaign/550e8400-e29b-41d4-a716-446655440000".to_string(),
            10,
            3,
        );

        assert_eq!(config.admin, authority);
        assert_eq!(config.treasury_authority, authority);
        assert!(!config.paused);
        assert_eq!(organization.status, OrganizationStatus::Pending);
        assert!(!organization.verified);
        assert_eq!(organization.next_campaign_id, 0);
        assert_eq!(campaign.status, CampaignStatus::Draft);
        assert_eq!(campaign.amount_raised, 0);
        assert_eq!(campaign.amount_disbursed, 0);
        assert_eq!(campaign.amount_reserved, 0);
        assert_eq!(campaign.next_allocation_id, 0);
    }

    #[test]
    fn unauthorized_authority_and_empty_digests_fail() {
        assert!(require_authority(Pubkey::new_unique(), Pubkey::new_unique()).is_err());
        assert!(validate_digest(&[0; 32]).is_err());
        assert!(validate_digest(&digest()).is_ok());
    }

    #[test]
    fn account_spaces_include_discriminators() {
        assert_eq!(GlobalConfig::SPACE, 77);
        assert_eq!(Organization::SPACE, 156);
        assert_eq!(Campaign::SPACE, 683);
        assert_eq!(Allocation::SPACE, 146);
        assert_eq!(Disbursement::SPACE, 202);
        assert_eq!(DeliveryVerification::SPACE, 123);
        assert_eq!(TrustScore::SPACE, 92);
        assert_eq!(FraudFlag::SPACE, 84);
        assert_eq!(FundingCounter::SPACE, 73);
    }

    #[test]
    fn available_funds_reconciles_raised_disbursed_and_reserved_amounts() {
        let mut campaign = Campaign {
            organization: Pubkey::new_unique(), authority: Pubkey::new_unique(), campaign_id: 0,
            target_amount: 100, amount_raised: 100, amount_disbursed: 25, amount_reserved: 40,
            status: CampaignStatus::Active, created_at: 0, ends_at: None, evidence_digest: digest(),
            metadata_uri: "aidtrace://campaign/550e8400-e29b-41d4-a716-446655440000".to_string(),
            next_donation_id: 0, next_allocation_id: 0, bump: 0,
        };
        assert_eq!(available_funds(&campaign).unwrap(), 35);
        campaign.amount_reserved = 76;
        assert!(available_funds(&campaign).is_err());
    }

    #[test]
    fn campaign_status_transitions_are_human_gated_and_terminal() {
        assert!(campaign_status_transition_allowed(
            CampaignStatus::PendingReview,
            CampaignStatus::Active
        ));
        assert!(campaign_status_transition_allowed(
            CampaignStatus::Active,
            CampaignStatus::Paused
        ));
        assert!(campaign_status_transition_allowed(
            CampaignStatus::Paused,
            CampaignStatus::Active
        ));
        assert!(campaign_status_transition_allowed(
            CampaignStatus::Paused,
            CampaignStatus::Closed
        ));
        assert!(!campaign_status_transition_allowed(
            CampaignStatus::Draft,
            CampaignStatus::Active
        ));
        assert!(!campaign_status_transition_allowed(
            CampaignStatus::Active,
            CampaignStatus::Draft
        ));
        assert!(!campaign_status_transition_allowed(
            CampaignStatus::Closed,
            CampaignStatus::Active
        ));
    }

    #[test]
    fn campaign_metadata_and_donation_accounting_boundaries_are_validated() {
        assert!(validate_campaign_uri("aidtrace://campaign/550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(validate_campaign_uri("aidtrace://organization/550e8400-e29b-41d4-a716-446655440000").is_err());
        assert!(validate_campaign_uri("aidtrace://campaign/not-a-uuid").is_err());
        assert_eq!(0_u64.checked_add(1), Some(1));
        assert_eq!(u64::MAX.checked_add(1), None);
        assert_eq!(42_u64.checked_add(1), Some(43));
        assert_eq!(u64::MAX.checked_add(1), None);
    }

    #[test]
    fn organization_approval_and_transfer_rules() {
        let founder = Pubkey::new_unique();
        let next = Pubkey::new_unique();
        let mut organization = Organization {
            founder,
            authority: founder,
            pending_authority: None,
            metadata_digest: digest(),
            status: OrganizationStatus::Pending,
            verified: false,
            verified_delivery_count: 0,
            next_campaign_id: 0,
            bump: 1,
        };
        assert!(apply_status_change(&mut organization, OrganizationStatus::Active).is_err());
        assert!(apply_status_change(&mut organization, OrganizationStatus::Pending).is_err());
        assert!(apply_verification(&mut organization, true).is_ok());
        assert!(apply_verification(&mut organization, true).is_err());
        assert!(apply_status_change(&mut organization, OrganizationStatus::Active).is_ok());
        assert!(nominate_authority(&mut organization, founder).is_err());
        assert!(nominate_authority(&mut organization, next).is_ok());
        assert!(accept_authority(&mut organization, founder).is_err());
        assert_eq!(accept_authority(&mut organization, next).unwrap(), founder);
        assert_eq!(organization.founder, founder);
        assert_eq!(organization.authority, next);
        assert_eq!(organization.pending_authority, None);
        assert!(apply_status_change(&mut organization, OrganizationStatus::Closed).is_ok());
        assert!(apply_status_change(&mut organization, OrganizationStatus::Active).is_err());
    }
}
