use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;

use constants::*;
use errors::AidTraceError;
use events::*;
use state::*;

declare_id!("GAusyEYaJByQdsB6Z5LZ2irMrkorV8ork9XXkS1WsdRf");

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
            authority: ctx.accounts.authority.key(),
            metadata_digest,
            occurred_at: now,
        });
        Ok(())
    }

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: u64,
        target_amount: u64,
        ends_at: Option<i64>,
        evidence_digest: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, AidTraceError::ProtocolPaused);
        require!(
            ctx.accounts.organization.status == OrganizationStatus::Active,
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
            now,
            ctx.bumps.campaign,
        );
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
#[instruction(campaign_id: u64)]
pub struct CreateCampaign<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [ORGANIZATION_SEED, authority.key().as_ref()],
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
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
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
    organization.authority = authority;
    organization.metadata_digest = metadata_digest;
    organization.status = OrganizationStatus::Active;
    organization.verified_delivery_count = 0;
    organization.next_campaign_id = 0;
    organization.bump = bump;
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
    created_at: i64,
    bump: u8,
) {
    campaign.organization = organization;
    campaign.authority = authority;
    campaign.campaign_id = campaign_id;
    campaign.target_amount = target_amount;
    campaign.amount_raised = 0;
    campaign.amount_disbursed = 0;
    campaign.status = CampaignStatus::Draft;
    campaign.created_at = created_at;
    campaign.ends_at = ends_at;
    campaign.evidence_digest = evidence_digest;
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
            authority: Pubkey::default(),
            metadata_digest: [0; 32],
            status: OrganizationStatus::Suspended,
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
            status: CampaignStatus::Closed,
            created_at: 0,
            ends_at: None,
            evidence_digest: [0; 32],
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
            10,
            3,
        );

        assert_eq!(config.admin, authority);
        assert_eq!(config.treasury_authority, authority);
        assert!(!config.paused);
        assert_eq!(organization.status, OrganizationStatus::Active);
        assert_eq!(organization.next_campaign_id, 0);
        assert_eq!(campaign.status, CampaignStatus::Draft);
        assert_eq!(campaign.amount_raised, 0);
        assert_eq!(campaign.amount_disbursed, 0);
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
        assert_eq!(Organization::SPACE, 90);
        assert_eq!(Campaign::SPACE, 163);
        assert_eq!(Allocation::SPACE, 146);
        assert_eq!(Disbursement::SPACE, 202);
        assert_eq!(DeliveryVerification::SPACE, 123);
        assert_eq!(TrustScore::SPACE, 92);
        assert_eq!(FraudFlag::SPACE, 84);
        assert_eq!(FundingCounter::SPACE, 73);
    }
}
