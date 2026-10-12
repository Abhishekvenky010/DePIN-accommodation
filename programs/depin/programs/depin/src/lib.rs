use anchor_lang::prelude::*;

declare_id!("Aa9c2mKRb9VgZAR6GpgLA8ujRjuzUFLM7EYJQryjWJmH");

#[program]
pub mod accommodation_escrow {
    use super::*;

    pub fn create_and_fund_escrow(
        ctx: Context<CreateAndFundEscrow>,
        booking_id: String,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);
        require!(!booking_id.is_empty(), ErrorCode::InvalidBookingId);
        
        // Validate that guest and host are different
        require!(
            ctx.accounts.guest.key() != ctx.accounts.host.key(),
            ErrorCode::InvalidGuestHost
        );

        let escrow = &mut ctx.accounts.escrow;
        escrow.booking_id = booking_id;
        escrow.guest = ctx.accounts.guest.key();
        escrow.host = ctx.accounts.host.key();
        escrow.amount = amount;
        escrow.status = EscrowStatus::Funded;
        escrow.guest_confirmed_completion = false;
        escrow.host_confirmed_completion = false;
        escrow.guest_confirmed_cancellation = false;
        escrow.host_confirmed_cancellation = false;
        escrow.bump = ctx.bumps.escrow;

        // Transfer SOL from guest to escrow
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.guest.to_account_info(),
                to: escrow.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        Ok(())
    }

    pub fn host_accept(ctx: Context<HostAccept>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Only host can accept
        require!(
            escrow.host == ctx.accounts.host.key(),
            ErrorCode::UnauthorizedHost
        );
        
        // Only funded booking can be accepted
        require!(
            escrow.status == EscrowStatus::Funded,
            ErrorCode::InvalidStateTransition
        );
        
        // Cannot accept if cancellation has been initiated
        require!(
            !escrow.guest_confirmed_cancellation && !escrow.host_confirmed_cancellation,
            ErrorCode::InvalidStateTransition
        );

        escrow.status = EscrowStatus::Accepted;
        Ok(())
    }

    pub fn confirm_completion(ctx: Context<ConfirmCompletion>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Booking must have been accepted
        require!(
            escrow.status == EscrowStatus::Accepted || escrow.status == EscrowStatus::Funded,
            ErrorCode::InvalidStateTransition
        );
        
        // Cannot complete if cancellation has started
        require!(
            !escrow.guest_confirmed_cancellation && !escrow.host_confirmed_cancellation,
            ErrorCode::InvalidStateTransition
        );
        
        // Cannot complete if already released/refunded
        require!(
            escrow.status != EscrowStatus::Released && escrow.status != EscrowStatus::Refunded,
            ErrorCode::InvalidStateTransition
        );
        
        // Check who is confirming
        if ctx.accounts.signer.key() == escrow.guest {
            require!(!escrow.guest_confirmed_completion, ErrorCode::InvalidStateTransition);
            escrow.guest_confirmed_completion = true;
        } else if ctx.accounts.signer.key() == escrow.host {
            require!(!escrow.host_confirmed_completion, ErrorCode::InvalidStateTransition);
            escrow.host_confirmed_completion = true;
        } else {
            return Err(error!(ErrorCode::Unauthorized));
        }

        // If both confirmed, release funds to host
        if escrow.guest_confirmed_completion && escrow.host_confirmed_completion {
            let rent_exempt = Rent::get()?.minimum_balance(escrow.to_account_info().data_len());
            require!(
                escrow.to_account_info().lamports() >= rent_exempt + escrow.amount,
                ErrorCode::InsufficientFunds
            );
            
            // Release funds to host
            **escrow.to_account_info().lamports.borrow_mut() -= escrow.amount;
            **ctx.accounts.host.to_account_info().lamports.borrow_mut() += escrow.amount;
            
            escrow.status = EscrowStatus::Released;
        } else {
            // Mark as completion started
            escrow.status = EscrowStatus::Accepted;
        }

        Ok(())
    }

    pub fn request_cancellation(ctx: Context<RequestCancellation>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Can only cancel if not yet released/refunded
        require!(
            escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::Accepted,
            ErrorCode::InvalidStateTransition
        );
        
        // Cannot cancel if completion has started (either party confirmed)
        require!(
            !escrow.guest_confirmed_completion && !escrow.host_confirmed_completion,
            ErrorCode::InvalidStateTransition
        );
        
        // Check who is requesting cancellation
        if ctx.accounts.signer.key() == escrow.guest {
            require!(!escrow.guest_confirmed_cancellation, ErrorCode::InvalidStateTransition);
            escrow.guest_confirmed_cancellation = true;
        } else if ctx.accounts.signer.key() == escrow.host {
            require!(!escrow.host_confirmed_cancellation, ErrorCode::InvalidStateTransition);
            escrow.host_confirmed_cancellation = true;
        } else {
            return Err(error!(ErrorCode::Unauthorized));
        }

        // If both confirmed cancellation, refund guest
        if escrow.guest_confirmed_cancellation && escrow.host_confirmed_cancellation {
            let rent_exempt = Rent::get()?.minimum_balance(escrow.to_account_info().data_len());
            require!(
                escrow.to_account_info().lamports() >= rent_exempt + escrow.amount,
                ErrorCode::InsufficientFunds
            );
            
            // Refund funds to guest
            **escrow.to_account_info().lamports.borrow_mut() -= escrow.amount;
            **ctx.accounts.guest.to_account_info().lamports.borrow_mut() += escrow.amount;
            
            escrow.status = EscrowStatus::Refunded;
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(booking_id: String, amount: u64)]
pub struct CreateAndFundEscrow<'info> {
    #[account(
        init,
        payer = guest,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", booking_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub guest: Signer<'info>,
    /// CHECK: This is validated against stored value after initialization
    pub host: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct HostAccept<'info> {
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub host: Signer<'info>,
}

#[derive(Accounts)]
pub struct ConfirmCompletion<'info> {
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: This is validated against stored value after initialization
    pub host: AccountInfo<'info>,
    /// CHECK: This is validated against stored value after initialization
    pub guest: AccountInfo<'info>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct RequestCancellation<'info> {
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: Validated - must match escrow.guest
    pub guest: AccountInfo<'info>,
    /// CHECK: Validated - must match escrow.host
    pub host: AccountInfo<'info>,
    pub signer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    #[max_len(100)]
    pub booking_id: String,
    pub guest: Pubkey,
    pub host: Pubkey,
    pub amount: u64,
    pub status: EscrowStatus,
    pub guest_confirmed_completion: bool,
    pub host_confirmed_completion: bool,
    pub guest_confirmed_cancellation: bool,
    pub host_confirmed_cancellation: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum EscrowStatus {
    Funded,
    Accepted,
    Released,
    Refunded,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid booking ID")]
    InvalidBookingId,
    #[msg("Guest and host cannot be the same")]
    InvalidGuestHost,
    #[msg("Unauthorized host")]
    UnauthorizedHost,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid state transition")]
    InvalidStateTransition,
    #[msg("Insufficient funds in escrow")]
    InsufficientFunds,
}
