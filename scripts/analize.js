const fs = require('fs');

async function main() {
    fs.readdir(__dirname + "/../artifacts/contracts/", (err, files) => {
        files.forEach(dir => {
            fs.readdir(__dirname + "/../artifacts/contracts/" + dir, (err, files) => {
                files.forEach(file => {
                    if( new RegExp(".*\.dbg\..*").test(file) )
                        return;
                    var contract_abi = require(__dirname + "/../artifacts/contracts/"+ dir + "/" + file);
                    if( contract_abi.bytecode == '0x' )
                        return;
                    //var len1 = (contract_abi.bytecode.length - 2)/2;
                    var len2 = (contract_abi.deployedBytecode.length - 2)/2;
                    console.log("Deployed code length:", file, "=", len2);
                });
            });
        });
    });
}

main()
