import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const keypairPath =
  process.env.SOLANA_KEYPAIR_PATH ??
  `${homedir()}/.config/solana/thefixer.json`;

export const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(keypairPath, "utf8"))),
);

export const wallet = new anchor.Wallet(payer);