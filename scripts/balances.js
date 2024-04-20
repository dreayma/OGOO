async function main() {
    var accounts = await hre.ethers.getSigners();
    for(var i=0; i < accounts.length; i += 1) {
        var account = accounts[i];
        var balance = await account.provider.getBalance(account.address);
        var gas_price = (await account.provider.getFeeData()).gasPrice;
        console.log("Balance:", account.address, balance, gas_price);
    }
}

main()
