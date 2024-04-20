async function main() {
    const accounts = await hre.ethers.getSigners();
    const account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    const account_outside = accounts[1]; // the second account will be a signer to check an access from the outside
    const Offer = await ethers.getContractFactory("Offer", account_owner);
    console.info("Offer", Offer);
    // Start deployment, returning a promise that resolves to a contract object
    const offer = await Offer.deploy({
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1,
        "observer_award": 0,
        "share_min_balance": 0,
        "observers_vote_share": 10000,
        "shareholders_vote_share": 10000,
        "shareholders_vote_amount_share": 10000,
    });
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    console.log("Contract deployed to address:", offer.target);
    console.log("Contract owner is:", await offer.owner());
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
