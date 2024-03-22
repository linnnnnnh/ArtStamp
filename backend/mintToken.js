const xrpl = require("xrpl");
require('dotenv').config();

async function mintToken(h) {
    const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();

    console.log(client.isConnected());

    const wallet = xrpl.Wallet.fromSeed(process.env.XRPL_SECRET);

    // mint the NFT:
    const tx = {
        TransactionType: "NFTokenMint",
        Account: wallet.address,
        NFTokenTaxon: 0,
        Flags: xrpl.NFTokenMintFlags.tfTransferable,
        URI: h,
        TransferFee: 0
    }
    console.log(tx);

    const result = await client.submitAndWait(tx, { autofill: true, wallet });
    console.log(result);
    const txDate = result.result.date;
    const txHash = result.result.hash;
    const txURI = result.result.URI;

    await client.disconnect();

    return { txDate, txHash, txURI };
}

module.exports = mintToken;