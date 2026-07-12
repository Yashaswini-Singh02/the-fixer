import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import type { Txoracle } from "./types/txoracle";
import txoracleIdl from "./idl/txoracle.json";
import { rpcUrl, programId, txlTokenMint, NETWORK } from "./config";
import { wallet } from "./wallet";

const SERVICE_LEVEL_ID = 1;          // devnet free tier
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = [];

const connection = new Connection(rpcUrl, "confirmed");
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const program = new anchor.Program<Txoracle>(txoracleIdl as Txoracle, provider);
if (!program.programId.equals(programId)) {
  throw new Error(`IDL program ${program.programId.toBase58()} != ${NETWORK} program ${programId.toBase58()}`);
}

// --- PDAs + token accounts (docs Step 2, verbatim) ---
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")], program.programId);
const tokenTreasuryVault = getAssociatedTokenAddressSync(
  txlTokenMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")], program.programId);
const userTokenAccount = getAssociatedTokenAddressSync(
  txlTokenMint, provider.wallet.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

// the program requires the user's TXL token account to exist, even at 0 cost;
// a fresh wallet has none, so create it in the same tx (idempotent = safe to re-run)
const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
  provider.wallet.publicKey, // fee payer
  userTokenAccount,          // ATA address to create
  provider.wallet.publicKey, // owner
  txlTokenMint,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
);

const txSig = await program.methods
  .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
  .preInstructions([createAtaIx])
  .accounts({
    user: provider.wallet.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: txlTokenMint,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Subscribed on", NETWORK);
console.log("txSig:", txSig);