use anchor_lang::prelude::*;

#[account]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub treasury_authority: Pubkey,
    pub fraud_threshold: u8,
    pub paused: bool,
    pub protocol_version: u16,
    pub bump: u8,
}

impl GlobalConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + 2 + 1;
}

#[account]
pub struct Organization {
    pub founder: Pubkey,
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub metadata_digest: [u8; 32],
    pub status: OrganizationStatus,
    pub verified: bool,
    pub verified_delivery_count: u64,
    pub next_campaign_id: u64,
    pub bump: u8,
}

impl Organization {
    pub const SPACE: usize = 8 + 32 + 32 + 33 + 32 + 1 + 1 + 8 + 8 + 1;
}

#[account]
pub struct Campaign {
    pub organization: Pubkey,
    pub authority: Pubkey,
    pub campaign_id: u64,
    pub target_amount: u64,
    pub amount_raised: u64,
    pub amount_disbursed: u64,
    /// Funds committed to open allocations but not yet paid from the vault.
    pub amount_reserved: u64,
    pub status: CampaignStatus,
    pub created_at: i64,
    pub ends_at: Option<i64>,
    pub evidence_digest: [u8; 32],
    pub metadata_uri: String,
    pub next_donation_id: u64,
    pub next_allocation_id: u64,
    pub bump: u8,
}

impl Campaign {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 9 + 32 + 4 + 500 + 8 + 8 + 1;
}

#[account]
pub struct CampaignVault {
    pub campaign: Pubkey,
    pub bump: u8,
}
impl CampaignVault { pub const SPACE: usize = 8 + 32 + 1; }

#[account]
pub struct Donation {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub donation_id: u64,
    pub amount: u64,
    pub source: DonationSource,
    pub occurred_at: i64,
    pub bump: u8,
}
impl Donation { pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 8 + 1; }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum DonationSource { Standard }

#[account]
pub struct Allocation {
    pub campaign: Pubkey,
    pub allocation_id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    pub spent: u64,
    pub purpose_digest: [u8; 32],
    pub created_at: i64,
    pub status: AllocationStatus,
    pub next_disbursement_id: u64,
    pub bump: u8,
}

impl Allocation {
    pub const SPACE: usize = 8 + 32 + 8 + 32 + 8 + 8 + 32 + 8 + 1 + 8 + 1;
}

#[account]
pub struct Disbursement {
    pub allocation: Pubkey,
    pub campaign: Pubkey,
    pub disbursement_id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    pub evidence_digest: [u8; 32],
    pub created_at: i64,
    pub authority: Pubkey,
    pub status: DisbursementStatus,
    pub next_delivery_verification_id: u64,
    pub bump: u8,
}

impl Disbursement {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 32 + 8 + 32 + 8 + 32 + 1 + 8 + 1;
}

#[account]
pub struct DeliveryVerification {
    pub disbursement: Pubkey,
    pub verification_id: u64,
    pub verifier: Pubkey,
    pub evidence_digest: [u8; 32],
    pub status: VerificationStatus,
    pub verified_at: Option<i64>,
    pub bump: u8,
}

impl DeliveryVerification {
    pub const SPACE: usize = 8 + 32 + 8 + 32 + 32 + 1 + 9 + 1;
}

/// A verifier is scoped to one organization and may be revoked without
/// deleting its historical verification milestones.
#[account]
pub struct Verifier {
    pub organization: Pubkey,
    pub verifier: Pubkey,
    pub active: bool,
    pub bump: u8,
}

impl Verifier {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1;
}

#[account]
pub struct TrustScore {
    pub subject: Pubkey,
    pub score: u8,
    pub risk_band: RiskBand,
    pub model_version_digest: [u8; 32],
    pub evaluated_at: i64,
    pub canonical_sequence: u64,
    pub flagged: bool,
    pub bump: u8,
}

impl TrustScore {
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 32 + 8 + 8 + 1 + 1;
}

#[account]
pub struct FraudFlag {
    pub subject: Pubkey,
    pub severity: u8,
    pub triggering_score: u8,
    pub reason_digest: [u8; 32],
    pub created_at: i64,
    pub resolution: FraudFlagResolution,
    pub bump: u8,
}

impl FraudFlag {
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 32 + 8 + 1 + 1;
}

#[account]
pub struct FundingCounter {
    pub campaign: Pubkey,
    pub realtime_amount: u64,
    pub last_canonical_amount: u64,
    pub last_sequence: u64,
    pub last_commit_at: i64,
    pub bump: u8,
}

impl FundingCounter {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum OrganizationStatus {
    Pending,
    Active,
    Suspended,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    Draft,
    PendingReview,
    Active,
    Paused,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum AllocationStatus {
    Open,
    Closed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum DisbursementStatus {
    Recorded,
    Verified,
    Disputed,
    Rejected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum VerificationStatus {
    Pending,
    Verified,
    Disputed,
    Rejected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum RiskBand {
    Low,
    Watch,
    ReviewRecommended,
    HighPriorityReview,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum FraudFlagResolution {
    Open,
    Resolved,
    Dismissed,
}
