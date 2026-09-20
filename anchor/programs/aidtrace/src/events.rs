use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub config: Pubkey,
    pub admin: Pubkey,
    pub treasury_authority: Pubkey,
    pub protocol_version: u16,
    pub occurred_at: i64,
}

#[event]
pub struct OrganizationRegistered {
    pub organization: Pubkey,
    pub authority: Pubkey,
    pub metadata_digest: [u8; 32],
    pub occurred_at: i64,
}

#[event]
pub struct CampaignCreated {
    pub campaign: Pubkey,
    pub organization: Pubkey,
    pub authority: Pubkey,
    pub campaign_id: u64,
    pub status: CampaignStatusEvent,
    pub occurred_at: i64,
}

#[event]
pub struct CampaignStatusChanged {
    pub campaign: Pubkey,
    pub actor: Pubkey,
    pub previous_status: CampaignStatusEvent,
    pub next_status: CampaignStatusEvent,
    pub occurred_at: i64,
}

#[event]
pub struct DonationReceived {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
    pub sequence: u64,
    pub occurred_at: i64,
}

#[event]
pub struct AllocationCreated {
    pub allocation: Pubkey,
    pub campaign: Pubkey,
    pub actor: Pubkey,
    pub allocation_id: u64,
    pub amount: u64,
    pub occurred_at: i64,
}

#[event]
pub struct DisbursementRecorded {
    pub disbursement: Pubkey,
    pub allocation: Pubkey,
    pub campaign: Pubkey,
    pub actor: Pubkey,
    pub disbursement_id: u64,
    pub amount: u64,
    pub occurred_at: i64,
}

#[event]
pub struct DeliveryVerified {
    pub verification: Pubkey,
    pub disbursement: Pubkey,
    pub verifier: Pubkey,
    pub verification_id: u64,
    pub status: VerificationStatusEvent,
    pub occurred_at: i64,
}

#[event]
pub struct TrustScoreCommitted {
    pub trust_score: Pubkey,
    pub subject: Pubkey,
    pub score: u8,
    pub sequence: u64,
    pub occurred_at: i64,
}

#[event]
pub struct FraudFlagRaised {
    pub fraud_flag: Pubkey,
    pub subject: Pubkey,
    pub severity: u8,
    pub triggering_score: u8,
    pub occurred_at: i64,
}

#[event]
pub struct FraudFlagResolved {
    pub fraud_flag: Pubkey,
    pub subject: Pubkey,
    pub actor: Pubkey,
    pub occurred_at: i64,
}

#[event]
pub struct FundingCounterCommitted {
    pub funding_counter: Pubkey,
    pub campaign: Pubkey,
    pub canonical_amount: u64,
    pub sequence: u64,
    pub occurred_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum CampaignStatusEvent {
    Draft,
    PendingReview,
    Active,
    Paused,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum VerificationStatusEvent {
    Pending,
    Verified,
    Disputed,
    Rejected,
}
