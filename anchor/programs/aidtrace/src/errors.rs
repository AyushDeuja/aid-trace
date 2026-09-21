use anchor_lang::prelude::*;

#[error_code]
pub enum AidTraceError {
    #[msg("The supplied authority is not permitted to perform this action")]
    Unauthorized,
    #[msg("Global configuration has already been initialized")]
    ConfigurationAlreadyInitialized,
    #[msg("The protocol is paused")]
    ProtocolPaused,
    #[msg("The organization is not active")]
    OrganizationNotActive,
    #[msg("The organization is not verified")]
    OrganizationNotVerified,
    #[msg("The proposed organization authority is invalid")]
    InvalidAuthorityTransfer,
    #[msg("The requested state transition is invalid")]
    InvalidStatusTransition,
    #[msg("A required SHA-256 digest cannot be all zeroes")]
    InvalidDigest,
    #[msg("A numeric input is invalid")]
    InvalidInput,
    #[msg("The provided amount must be greater than zero")]
    InvalidAmount,
    #[msg("A parent-scoped record counter has reached its maximum value")]
    CounterExhausted,
    #[msg("Arithmetic overflow or underflow")]
    ArithmeticOverflow,
    #[msg("The supplied account does not match the expected PDA")]
    InvalidPda,
    #[msg("The supplied account has an unexpected owner")]
    InvalidAccountOwner,
    #[msg("The supplied sequence number is invalid")]
    InvalidSequence,
}
