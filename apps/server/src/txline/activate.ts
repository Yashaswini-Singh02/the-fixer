import axios from "axios";
import nacl from "tweetnacl";
import { apiOrigin, apiBaseUrl } from "./config";
import { payer } from "./wallet";

// usage: npx tsx src/txline/activate.ts <txSig-from-subscribe>
const txSig = process.argv[2];
if (!txSig) {
  console.error("usage: npx tsx src/txline/activate.ts <txSig>");
  process.exit(1);
}

const SELECTED_LEAGUES: number[] = [];

// 1. guest JWT — a temporary identity to talk to the API at all
const authResponse = await axios.post(`${apiOrigin}/auth/guest/start`);
const jwt = authResponse.data.token;

// 2. sign exactly `${txSig}::${jwt}` (empty leagues -> double colon)
const message = new TextEncoder().encode(
  `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`,
);
const signatureBytes = nacl.sign.detached(message, payer.secretKey);
const walletSignature = Buffer.from(signatureBytes).toString("base64");

// 3. trade the proof for an API token
const activationResponse = await axios.post(
  `${apiBaseUrl}/token/activate`,
  { txSig, walletSignature, leagues: SELECTED_LEAGUES },
  { headers: { Authorization: `Bearer ${jwt}` } },
);

const apiToken = activationResponse.data.token ?? activationResponse.data;
console.log("TXLINE_JWT=" + jwt);
console.log("TXLINE_API_TOKEN=" + apiToken);