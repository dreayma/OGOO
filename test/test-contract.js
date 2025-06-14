const { expect, should } = require("chai");

should();

// TODO: test revoting for correct change leaders state
// TODO: test CancelationInProgress

function to$(wei) {
  var cents_per_ether = 300000n;
  var weis_per_ether = 1000000000000000000n;
  return hre.ethers.toNumber((wei * cents_per_ether) / weis_per_ether ) / 100.;
}

function extractData(ex) {
  var data = ex.data;
  if( typeof(data) == 'undefined' ) {
    return 'unknown';
  }
  if( typeof(data) != 'string') {
    return extractData(data);
  }
  return data;
}

describe("Contract Tests", function () {
  it("Test the contract life circle main path", async function () {
    console.log("Test the contract life circle main path");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var test_definition_values = [];
    for(var k in test_definition) {
        test_definition_values.push(test_definition[k]);
    }
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_observer = accounts[1]; // the account will be a signer to check an access from the observer
    var account_contributor = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var beginning_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account at the beginning:", beginning_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");
    // Gas price and other fee data
    var fee_data = await account_owner.provider.getFeeData();
    // Calculate gas for deployment
    var deployment_gas_price = await account_owner.estimateGas(await Offer.getDeployTransaction(test_definition));
    console.debug("Projected deployment price:", deployment_gas_price, deployment_gas_price * fee_data.gasPrice, "Amount $:", to$(deployment_gas_price * fee_data.gasPrice));
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance, start_balance - beginning_balance);
    // Start deployment, returning a promise that resolves to a contract object

    // sample for the online event filter for the OfferCreated event when the address is not yet known
    var create_offer_filter = {
        topics: [
          ethers.id('OfferCreated()')
        ]
    }
    var offer_created_log;
    var create_offer_handler = (log) => {
        console.log('OfferCreated event for:', log.address);
        offer_created_log = log;
    }
    expect(offer_created_log).to.be.a('undefined');
    account_owner.provider.on(create_offer_filter, create_offer_handler);
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    await new Promise(resolve => setTimeout(resolve, 1000));
    account_owner.provider.off(create_offer_filter, create_offer_handler);
    expect(offer_created_log).to.not.be.a('undefined');
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the observer
    var observer_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_observer, // Observer account trying access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      var definition = await o.definition();
      expect(test_definition_values).to.have.deep.members(definition);
      await new Promise(resolve => setTimeout(resolve, 1000));
      // test updating the definition
      test_definition.contributors_vote_fund_percent = 9900n;
      var txod = await o.definition_update(test_definition);
      var txod_receipt = await txod.wait();
      await new Promise(resolve => setTimeout(resolve, 1000));
      definition = await o.definition();
      test_definition_values = [];
      for(var k in test_definition) {
        test_definition_values.push(test_definition[k]);
      }
      expect(test_definition_values).to.have.deep.members(definition);

      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // test the contributor contribution_min_balance
      account_contributor.sendTransaction({to:offer.target, value:0n}).should.eventually.rejectedWith('reverted');
      account_contributor.sendTransaction({to:offer.target, value:20000000000000001n}).should.eventually.rejectedWith('reverted');

      // test the contributor created an account sending there enough amount
      await (await account_contributor.sendTransaction({to:offer.target, value:30000000000000001n})).wait();

      var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      var diff = start_balance_contributor - end_balance_contributor;
      console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      // test the contributor can increase the balance
      await (await account_contributor.sendTransaction({to:offer.target, value:10000000000000001n})).wait();

      end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      diff = start_balance_contributor - end_balance_contributor;
      console.debug("Contributor account after updating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after updating contribution:", end_balance_offer);

      var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account after creating contribution:", end_balance_owner);

      // test access to the origin's contribution
      var outside_contribution = await outside_access.contribution_get_for_origin();
      outside_contribution.should.be.equal(0n);

      var contributor_contribution = await contributor_access.contribution_get_for_origin();
      contributor_contribution.should.be.equal(40000000000000002n);

      // testing observers creation
      await (await o.observer_create(account_outside.address)).wait();
      console.log("Registered observer address to cancel:", account_outside.address);

      await (await o.observer_create(account_observer.address)).wait();
      console.log("Registered observer address to work with:", account_observer.address);

      // test observer's removing
      await (await o.observer_remove(account_outside.address)).wait();

      // test removing absent observer
      o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted');

      console.log('Going to approve the contract...');
      // try to approve by the outside account should lead to revert
      o.interface.parseError(extractData(await outside_access.approve().should.eventually.rejectedWith('reverted'))).name.should.be.equal('OwnerOnly');
      // approve and check the runtime event generation
      {
          var offer_approved_event;
          var offer_approved_event_outside;
          o.once('OfferApproved', (event) => {
            offer_approved_event = event;
          });
          outside_access.once('OfferApproved', (event) => {
            offer_approved_event_outside = event;
          });
          // Approve the contract to make it unmutable
          await (await o.approve()).wait();
          await new Promise(resolve => setTimeout(resolve, 1000));
          expect(offer_approved_event).to.not.be.a('undefined');
          expect(offer_approved_event_outside).to.not.be.a('undefined');
      }
      console.log('...the contract approved');
      // Trying to modify observers list should be failed
      o.interface.parseError(extractData(await o.observer_create(account_outside.address).should.eventually.rejectedWith('reverted'))).name.should.be.equal('PreparedOnly');
      o.interface.parseError(extractData(await o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted'))).name.should.be.equal('PreparedOnly');

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);
      await (await contributor_access.contributor_vote(account_contractor.address)).wait();
      state = await contractor_access.state();
      console.log('State after contributor vote', state)
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await observer_access.observer_vote(account_contractor.address)).wait();
      state = await contractor_access.state();
      console.log('State after observer vote', state);
      state.should.be.equal(2n);
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));

      // check the events history
      {
          var events = await o.queryFilter(o.filters.OfferCreated());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.OfferDefinitionUpdated());
          events.length.should.be.equal(1);
          expect(events[0].args[0]).to.deep.equal(test_definition_values);
      }
      {
          var events = await o.queryFilter(outside_access.filters.ObserverCreated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_outside.address);
          expect(events[1].args[0]).to.equal(account_observer.address);
      }
      {
          var events = await o.queryFilter(outside_access.filters.ObserverRemoved());
          events.length.should.be.equal(1);
          expect(events[0].args[0]).to.equal(account_outside.address);
      }
      {
          var events = await o.queryFilter(o.filters.OfferApproved());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCreated());
          events.length.should.be.equal(1);
          expect(events[0].args[0]).to.equal(account_contributor.address);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionUpdated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor.address);
          expect(events[0].args[1]).to.equal(30000000000000001n);
          expect(events[1].args[1]).to.equal(40000000000000002n);
      }
      {
          var events = await o.queryFilter(o.filters.ContributorVote());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contributor.address,account_contractor.address,false])
      }
      {
          var events = await o.queryFilter(o.filters.ObserverVote());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_observer.address,account_contractor.address,false])
      }
      {
          var events = await o.queryFilter(o.filters.OfferCompleted());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contractor.address,40000000000000002n])
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the case without observers", async function () {
    console.log("Test the case without observers");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_contributor = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      await new Promise(resolve => setTimeout(resolve, 1000));

      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);
      var start_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
      console.debug("Contributor2 account before creating contribution:", start_balance_contributor2);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // test the contributor created an account sending there enough amount
      await (await account_contributor.sendTransaction({to:offer.target, value: 30000000000000001n})).wait();
      await (await account_contributor2.sendTransaction({to:offer.target, value: 30000000000000001n})).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      {
        var end_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
        var diff = start_balance_contributor2 - end_balance_contributor2;
        console.debug("Contributor2 account after creating contribution:", end_balance_contributor2, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account after creating contribution:", end_balance_owner);

      // test access to the origin's contribution
      var outside_contribution = await outside_access.contribution_get_for_origin();
      outside_contribution.should.be.equal(0n);

      {
        var contributor_contribution = await contributor_access.contribution_get_for_origin();
        contributor_contribution.should.be.equal(30000000000000001n);
      }
      {
        var contributor2_contribution = await contributor2_access.contribution_get_for_origin();
        contributor2_contribution.should.be.equal(30000000000000001n);
      }

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // Trying to modify observers list should be failed
      o.interface.parseError(extractData(await o.observer_create(account_outside.address).should.eventually.rejectedWith('reverted'))).name.should.be.equal('PreparedOnly');
      o.interface.parseError(extractData(await o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted'))).name.should.be.equal('PreparedOnly');

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      await (await contributor_access.contributor_vote(account_contractor.address)).wait();
      console.debug("Contributor has just voted");
      await (await contributor2_access.contributor_vote(account_contractor.address)).wait();
      console.debug("Contributor2 has just voted");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));

      // check the events history
      {
          var events = await o.queryFilter(o.filters.OfferCreated());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.OfferApproved());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCreated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionUpdated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
          expect(events[0].args[1]).to.equal(30000000000000001n);
          expect(events[1].args[1]).to.equal(30000000000000001n);
      }
      {
          var events = await o.queryFilter(o.filters.ContributorVote());
          events.length.should.be.equal(2);
          expect(events[0].args).to.deep.equal([account_contributor.address,account_contractor.address,false])
          expect(events[1].args).to.deep.equal([account_contributor2.address,account_contractor.address,false])
      }
      {
          var events = await o.queryFilter(o.filters.OfferCompleted());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contractor.address,60000000000000002n])
      }

    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the contribution unlock timeout preventing contribution cancelling", async function () {
    console.log("Test the contribution unlock timeout preventing contribution cancelling");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 120n,
        "contribution_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_contributor = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);
      var start_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
      console.debug("Contributor2 account before creating contribution:", start_balance_contributor2);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // test the contributor created an account sending there enough amount
      await (await account_contributor.sendTransaction({to: offer.target, value: 30000000000000001n})).wait();
      await (await account_contributor2.sendTransaction({to:offer.target, value: 30000000000000001n})).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      {
        var end_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
        var diff = start_balance_contributor2 - end_balance_contributor2;
        console.debug("Contributor2 account after creating contribution:", end_balance_contributor2, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account after creating contribution:", end_balance_owner);

      // test access to the origin's contribution
      var outside_contribution = await outside_access.contribution_get_for_origin();
      outside_contribution.should.be.equal(0n);

      {
        var contributor_contribution = await contributor_access.contribution_get_for_origin();
        contributor_contribution.should.be.equal(30000000000000001n);
      }
      {
        var contributor2_contribution = await contributor2_access.contribution_get_for_origin();
        contributor2_contribution.should.be.equal(30000000000000001n);
      }

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      await (await contributor2_access.contribution_cancel()).wait();
      console.debug("Contributor2 has just cancelled contribution");
      {
        var time_to_cancel = await contributor2_access.contribution_can_be_canceled(account_contributor2.address);
        console.log("Contributor2 time to cancel", time_to_cancel);
      }

      await(await contributor_access.contributor_vote(account_contractor.address)).wait();
      console.debug("A single left contributor has just voted");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the contribution unlock timeout success contribution cancelling", async function () {
    console.log("Test the contribution unlock timeout success contribution cancelling");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 30n,
        "contribution_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_contributor = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      await new Promise(resolve => setTimeout(resolve, 1000));

      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);
      var start_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
      console.debug("Contributor2 account before creating contribution:", start_balance_contributor2);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // test the contributor created an account sending there enough amount
      await (await account_contributor.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
      await (await account_contributor2.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      {
        var end_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
        var diff = start_balance_contributor2 - end_balance_contributor2;
        console.debug("Contributor2 account after creating contribution:", end_balance_contributor2, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account after creating contribution:", end_balance_owner);

      // test access to the origin's contribution
      var outside_contribution = await outside_access.contribution_get_for_origin();
      outside_contribution.should.be.equal(0n);

      {
        var contributor_contribution = await contributor_access.contribution_get_for_origin();
        contributor_contribution.should.be.equal(30000000000000001n);
      }
      {
        var contributor2_contribution = await contributor2_access.contribution_get_for_origin();
        contributor2_contribution.should.be.equal(30000000000000001n);
      }

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await contributor2_access.contribution_cancel()).wait();
      console.debug("Contributor2 has just cancelled contribution");
      while(42) {
        // generate a block to increase the time without mining - necessary for hardhat node
        await (await account_contributor2.sendTransaction({to:account_owner, value:100n})).wait();
        var time_to_cancel = await contributor2_access.contribution_can_be_canceled(account_contributor2.address);
        if( !time_to_cancel )
          break;
        console.log("Contributor2 time to cancel", time_to_cancel);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await (await contributor2_access.contribution_cancel()).wait();
      {
        var interm_balance_offer = await account_owner.provider.getBalance(offer.target);
        console.debug("Offer account after cancel contribution", interm_balance_offer);
        interm_balance_offer.should.be.equal(30000000000000001n);
      }
      console.debug("Contributor2 has just successfully cancelled contribution");
      await (await contributor_access.contributor_vote(account_contractor.address)).wait();
      console.debug("A single left contributor has just voted");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));

      // check the events history
      {
          var events = await o.queryFilter(o.filters.OfferCreated());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.OfferApproved());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCreated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionUpdated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
          expect(events[0].args[1]).to.equal(30000000000000001n);
          expect(events[1].args[1]).to.equal(30000000000000001n);
      }
      {
          var events = await o.queryFilter(o.filters.ContributorVote());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contributor.address,account_contractor.address,false])
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCanceled());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contributor2.address])
      }
      {
          var events = await o.queryFilter(o.filters.OfferCompleted());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contractor.address,30000000000000001n])
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting start balance prevents early contract finishing", async function () {
    console.log("Test the voting start balance prevents early contract finishing");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 10n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 20000000000000000n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_contributor = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      await new Promise(resolve => setTimeout(resolve, 1000));

      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // test the contributor created an account
      await (await account_contributor.sendTransaction({to:offer.target, value:10000000000000001n})).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      {
        var state = await contractor_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      console.debug("A single contributor voting should success, but doesn't change state");
      await (await contributor_access.contributor_vote(account_contractor.address)).wait();
      {
        var state = await contractor_access.state();
        console.log('State should not be changed', state);
        state.should.be.equal(1n);
      }

      var start_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
      console.debug("Contributor2 account before creating contribution:", start_balance_contributor2);
      await (await account_contributor2.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
      {
        var end_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
        var diff = start_balance_contributor2 - end_balance_contributor2;
        console.debug("Contributor2 account after creating contribution:", end_balance_contributor2, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      console.debug("Contributor2 voting should success and finish the contract");
      await (await contributor2_access.contributor_vote(account_contractor.address)).wait();
      console.debug("Contributors have just voted");
      {
        var state = await contractor_access.state();
        console.log('State after contributors vote', state)
        state.should.be.equal(2n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));

      // check the events history
      {
          var events = await o.queryFilter(o.filters.OfferCreated());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.OfferApproved());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCreated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionUpdated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
          expect(events[0].args[1]).to.equal(10000000000000001n);
          expect(events[1].args[1]).to.equal(30000000000000001n);
      }
      {
          var events = await o.queryFilter(o.filters.ContributorVote());
          events.length.should.be.equal(2);
          expect(events[0].args).to.deep.equal([account_contributor.address,account_contractor.address,false])
          expect(events[1].args).to.deep.equal([account_contributor2.address,account_contractor.address,false])
      }
      {
          var events = await o.queryFilter(o.filters.OfferCompleted());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contractor.address,40000000000000002n])
      }

    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting start count prevents early contract finishing", async function () {
    console.log("Test the voting start count prevents early contract finishing");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 10n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 2n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_contributor = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // test the contributor created an account
      await (await account_contributor.sendTransaction({to:offer.target, value:10000000000000001n})).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      {
        var state = await contractor_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      console.debug("A single contributor voting should success, but doesn't change state");
      await (await contributor_access.contributor_vote(account_contractor.address)).wait();
      {
        var state = await contractor_access.state();
        console.log('State should not be changed', state);
        state.should.be.equal(1n);
      }

      var start_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
      console.debug("Contributor2 account before creating contribution:", start_balance_contributor2);
      await (await account_contributor2.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
      {
        var end_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
        var diff = start_balance_contributor2 - end_balance_contributor2;
        console.debug("Contributor2 account after creating contribution:", end_balance_contributor2, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      console.debug("Contributor2 voting should success and finish the contract now");
      await (await contributor2_access.contributor_vote(account_contractor.address)).wait();
      console.debug("Contributors have just voted");
      {
        var state = await contractor_access.state();
        console.log('State after contributors vote', state)
        state.should.be.equal(2n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));

      // check the events history
      {
          var events = await o.queryFilter(o.filters.OfferCreated());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.OfferApproved());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCreated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionUpdated());
          events.length.should.be.equal(2);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[1].args[0]).to.equal(account_contributor2.address);
          expect(events[0].args[1]).to.equal(10000000000000001n);
          expect(events[1].args[1]).to.equal(30000000000000001n);
      }
      {
          var events = await o.queryFilter(o.filters.ContributorVote());
          events.length.should.be.equal(2);
          expect(events[0].args).to.deep.equal([account_contributor.address,account_contractor.address,false])
          expect(events[1].args).to.deep.equal([account_contributor2.address,account_contractor.address,false])
      }
      {
          var events = await o.queryFilter(o.filters.OfferCompleted());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contractor.address,40000000000000002n])
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting start timeout fails the offer", async function () {
    console.log("Test the voting start timeout fails the offer");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 2n,
        "voting_start_timeout": 10n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_contributor = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();
      {
        var state = await outside_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      // test the contributor created an account
      await (await account_contributor.sendTransaction({to:offer.target, value:10000000000000001n})).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      console.debug("Waiting for the voting start timeout");
      await new Promise(resolve => setTimeout(resolve, 15000));
      console.debug("Try to vote by the contributor will lead to failure because of timeout");
      await (await contributor_access.contributor_vote(account_contractor.address)).wait();
      {
        var state = await outside_access.state();
        console.log('State after voting calculation should be failed', state)
        state.should.be.equal(3n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract failure, contribution has not been reverted yet", final_balance_offer);
      final_balance_offer.should.be.equal(10000000000000001n);

      console.log('Contributor may revert the contribution immediately');
      await (await contributor_access.contribution_cancel()).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor's account after reverting contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      // check the events history
      {
          var events = await o.queryFilter(o.filters.OfferCreated());
          events.length.should.be.equal(1, "OfferCreated");
      }
      {
          var events = await o.queryFilter(o.filters.OfferApproved());
          events.length.should.be.equal(1, "OfferApproved");
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCreated());
          events.length.should.be.equal(1, "ContributionCreated");
          expect(events[0].args[0]).to.equal(account_contributor.address);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionUpdated());
          events.length.should.be.equal(1, "ContributionUpdated");
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[0].args[1]).to.equal(10000000000000001n);
      }
      {
          var events = await o.queryFilter(o.filters.ContributorVote());
          events.length.should.be.equal(1, "ContributorVote");
      }
      {
          var events = await o.queryFilter(o.filters.OfferFailed());
          events.length.should.be.equal(1, "OfferFailed");
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCanceled());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contributor.address])
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting for failure", async function () {
    console.log("Test the voting for failure");
    var accounts = await hre.ethers.getSigners();
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_observer = accounts[1]; // the account will be a signer to check an access from the observer
    var account_contributor = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the observer
    var observer_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_observer, // Observer account trying access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      // test updating the definition

      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // test the contributor created an account sending there enough amount
      await (await account_contributor.sendTransaction({to:offer.target, value:30000000000000001n})).wait();

      var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      var diff = start_balance_contributor - end_balance_contributor;
      console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      await (await o.observer_create(account_observer.address)).wait();
      console.log("Registered observer address to work with:", account_observer.address);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);
      await (await contributor_access.contributor_vote_failure()).wait();
      state = await contractor_access.state();
      console.log('State after contributor vote', state)
      state.should.be.equal(1n);
      await (await observer_access.observer_vote_failure()).wait();
      state = await contractor_access.state();
      console.log("State after observer's vote should be failed", state);
      state.should.be.equal(3n);
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract failure", final_balance_offer);
      final_balance_offer.should.be.equal(30000000000000001n);
      console.log('Contributor may revert the contribution immediately');
      await (await contributor_access.contribution_cancel()).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor's account after reverting contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      // check the events history
      {
          var events = await o.queryFilter(o.filters.OfferCreated());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.OfferApproved());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCreated());
          events.length.should.be.equal(1);
          expect(events[0].args[0]).to.equal(account_contributor.address);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionUpdated());
          events.length.should.be.equal(1);
          expect(events[0].args[0]).to.equal(account_contributor.address);
          expect(events[0].args[1]).to.equal(30000000000000001n);
      }
      {
          var events = await o.queryFilter(o.filters.ContributorVote());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contributor.address,'0x0',true])
      }
      {
          var events = await o.queryFilter(o.filters.OfferFailed());
          events.length.should.be.equal(1);
      }
      {
          var events = await o.queryFilter(o.filters.ContributionCanceled());
          events.length.should.be.equal(1);
          expect(events[0].args).to.deep.equal([account_contributor.address])
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting fail timeout", async function () {
    console.log("Test the voting fail timeout");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 20n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_contributor = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating contribution:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating contribution:", start_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      {
        var state = await outside_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      // test the contributor created an account
      var start_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
      console.debug("Contributor account before creating contribution:", start_balance_contributor);
      {
        await (await account_contributor.sendTransaction({to:offer.target, value:10000000000000001n})).wait();

        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      var start_balance_contributor2 = await account_contributor2.provider.getBalance(account_contributor2.address);
      console.debug("Contributor2 account before creating contribution:", start_balance_contributor2);
      {
        await (await account_contributor2.sendTransaction({to:offer.target, value:20000000000000002n})).wait();

        var end_balance_contributor = await account_contributor2.provider.getBalance(account_contributor2.address);
        var diff = start_balance_contributor2 - end_balance_contributor;
        console.debug("Contributor2 account after creating contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating contribution:", end_balance_offer);

      await (await contributor_access.contributor_vote(account_contractor.address)).wait();
      console.debug("Contributor has just voted");
      var approved_at = await outside_access.approved_at();
      var failure_at = Number(test_definition.voting_fail_timeout) - (Number((await hre.ethers.provider.getBlock('latest')).timestamp) - Number(approved_at)) + 1;
      console.debug("Waiting for the voting failure timeout:", failure_at);
      await new Promise(resolve => setTimeout(resolve, 1000 * failure_at));
      console.debug("Trying to vote should lead to failure because of timeout");
      await (await contributor2_access.contributor_vote(account_contractor.address)).wait();
      {
        var state = await outside_access.state();
        console.log('State after voting calculation should be failed', state)
        state.should.be.equal(3n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract failure, contribution has not been reverted yet", final_balance_offer);
      final_balance_offer.should.be.equal(30000000000000003n);

      console.log('Contributors may revert the contribution immediately');
      await (await contributor_access.contribution_cancel()).wait();
      await (await contributor2_access.contribution_cancel()).wait();
      {
        var end_balance_contributor = await account_contributor.provider.getBalance(account_contributor.address);
        var diff = start_balance_contributor - end_balance_contributor;
        console.debug("Contributor's account after reverting contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      {
        var end_balance_contributor = await account_contributor2.provider.getBalance(account_contributor2.address);
        var diff = start_balance_contributor2 - end_balance_contributor;
        console.debug("Contributor's 2 account after reverting contribution:", end_balance_contributor, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the contributors vote contribution", async function () {
    console.log("Test the contributors vote contribution");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 6000n,
        "contributors_vote_fund_percent": 0n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_contributor1 = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contributor3 = accounts[3]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor1, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )
    var contributor3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor3, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the contributor created an account sending there enough amount
      await (await account_contributor1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_contributor2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_contributor3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await contributor1_access.contribution_get_for_origin()).should.be.equal(10000000000000001n);
      (await contributor2_access.contribution_get_for_origin()).should.be.equal(20000000000000001n);
      (await contributor3_access.contribution_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await contributor3_access.contributor_vote(account_contractor.address)).wait();
      console.debug("The most valuable contributor has just voted");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(1n);
      await (await contributor1_access.contributor_vote(account_contractor.address)).wait();
      console.debug("The least valuable contributor has just voted");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the contributors vote amount contribution", async function () {
    console.log("Test the contributors vote amount contribution");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 0n,
        "contributors_vote_fund_percent": 5000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_contributor1 = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contributor3 = accounts[3]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor1, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )
    var contributor3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor3, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the contributor created an account sending there enough amount
      await (await account_contributor1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_contributor2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_contributor3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await contributor1_access.contribution_get_for_origin()).should.be.equal(10000000000000001n);
      (await contributor2_access.contribution_get_for_origin()).should.be.equal(20000000000000001n);
      (await contributor3_access.contribution_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await contributor3_access.contributor_vote(account_contractor.address)).wait();
      console.debug("The most valuable contributor has just voted");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the observers vote", async function () {
    console.log("Test the observers vote");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 6000n,
        "contributors_vote_percent": 0n,
        "contributors_vote_fund_percent": 0n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_contributor1 = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contributor3 = accounts[3]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor1, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )
    var contributor3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor3, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Contributors also will be observers
      await (await o.observer_create(account_contributor1.address)).wait();
      await (await o.observer_create(account_contributor2.address)).wait();
      await (await o.observer_create(account_contributor3.address)).wait();

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the contributor created an account sending there enough amount
      await (await account_contributor1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_contributor2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_contributor3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await contributor1_access.contribution_get_for_origin()).should.be.equal(10000000000000001n);
      (await contributor2_access.contribution_get_for_origin()).should.be.equal(20000000000000001n);
      (await contributor3_access.contribution_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await contributor3_access.contributor_vote(account_contractor.address)).wait();
      console.debug("The most valuable contributor has just voted");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(1n);
      await (await contributor1_access.observer_vote(account_contractor.address)).wait();
      console.debug("The observer has just voted");
      state = await contractor_access.state();
      console.log('State after observers vote', state)
      state.should.be.equal(1n);
      await (await contributor2_access.observer_vote(account_contractor.address)).wait();
      console.debug("The other observer has just voted");
      state = await contractor_access.state();
      console.log('State after another observers vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting conflict", async function () {
    console.log("Test the voting conflict");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 3000n,
        "contributors_vote_percent": 3000n,
        "contributors_vote_fund_percent": 3000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_contributor1 = accounts[1]; // the account will be a signer to check an access from the contributor
    var account_contributor2 = accounts[2]; // the account will be a signer to check an access from the contributor
    var account_contributor3 = accounts[3]; // the account will be a signer to check an access from the contributor
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the contributor
    var contributor1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor1, // Contributor account trying access to the contract
    )
    var contributor2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor2, // Contributor account trying access to the contract
    )
    var contributor3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contributor3, // Contributor account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Let's the contractor is observer
      await (await o.observer_create(account_contractor.address)).wait();

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the contributor created an account sending there enough amount
      await (await account_contributor1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_contributor2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_contributor3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await contributor1_access.contribution_get_for_origin()).should.be.equal(10000000000000001n);
      (await contributor2_access.contribution_get_for_origin()).should.be.equal(20000000000000001n);
      (await contributor3_access.contribution_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      await (await contributor3_access.contributor_vote(account_contributor3.address)).wait();
      console.debug("The most valuable contributor has just voted for himself");
      await (await contributor1_access.contributor_vote(account_contributor1.address)).wait();
      await (await contributor2_access.contributor_vote(account_contributor1.address)).wait();
      console.debug("The least valuable contributors has just voted for contributor1");
      state = await contractor_access.state();
      console.log('State after contributors vote', state)
      state.should.be.equal(1n);

      await (await contractor_access.observer_vote(account_contractor.address)).wait();
      console.debug("The observer/contractor has just voted for himself");

      state = await contractor_access.state();
      console.log('State after conflict observer vote should not be changed, voting conflict', state)
      state.should.be.equal(1n);
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test multiple votings and revoting", async function () {
    console.log("Test multiple votings and revoting");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "contribution_unlock_timeout": 1n,
        "contribution_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_percent": 10000n,
        "contributors_vote_percent": 10000n,
        "contributors_vote_fund_percent": 10000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(offer.target, contract_abi.abi, account_owner);

    // Getting access from contributors
    var contributors = accounts.slice(1, 11).map((a)=> new ethers.Contract(offer.target, contract_abi.abi, a));
    var contractors = accounts.slice(11, 16).map((a)=> new ethers.Contract(offer.target, contract_abi.abi, a));
    var observers = accounts.slice(16, 20).map((a)=> new ethers.Contract(offer.target, contract_abi.abi, a));

    try {

      console.info('Create observers...', observers.length);

      await observers.reduce(async (memo, b) => {
        await memo;
        console.info('Creating observer', b.runner.address);
        return await (await o.observer_create(b.runner.address)).wait();
      }, 0);

      console.info('Approve the contract');
      await (await o.approve()).wait();

      var c_amount = 10000000000000000n;
      console.info('Contribute the contract');
      await Promise.all(contributors.map(async (c, i) => {
          return await (await c.runner.sendTransaction({to:o.target, value: c_amount + BigInt(i)})).wait();
      }));

      await o.validate();
      // Initial state before voting
      var state = await o.state();
      console.info('State before first vote', state);
      state.should.be.equal(1n);
      var start_offer_balance = await account_owner.provider.getBalance(offer.target);
      console.info('Balance before first vote', start_offer_balance, '[', to$(start_offer_balance), '=', to$(c_amount), ' * 10 ]');
      start_offer_balance.should.be.equal(c_amount * 10n + BigInt(9 * 10 / 2));
      var start_balance_contractor = await account_owner.provider.getBalance(contractors[0].runner.address);
      console.debug("Leader contractor account before contract success:", start_balance_contractor);
      var observer_balances = await Promise.all(observers.map( async (b)=>{
        return b.start_balance = await b.runner.provider.getBalance(b.runner.address);
      }))
      var contributor_balances = await Promise.all(contributors.map( async (c)=>{
        return c.start_balance = await c.runner.provider.getBalance(c.runner.address);
      }))

      observers.map((b) => {
          b.is_origin_observer().should.eventually.be.equal(true);
      });
      await o.validate();

      contributors.map((c) => {
        c.is_origin_contributor().should.eventually.be.equal(true);
      });
      await o.validate();
      console.log('Bad observers voting');
      await observers.reduce(async (memo, b) => {
          var i;
          [i, memo] = await memo;
          console.log('Observer', b.runner.address, 'votes for', contractors[i].runner.address);
          await o.validate();
          return [i+1, await (await b.observer_vote(contractors[i].runner.address)).wait()];
      }, [0, 0]);
      o.state().should.eventually.be.equal(1n);
      await o.validate();

      console.log('Bad contributors voting');
      await contributors.reduce(async (memo, c) => {
          var i;
          [i, memo] = await memo;
          console.log('Contributor', c.runner.address, 'votes for', contractors[i % contractors.length].runner.address);
          await o.validate();
          return [i+1, await (await c.contributor_vote(contractors[i % contractors.length].runner.address)).wait()];
      }, [0, 0]);
      o.state().should.eventually.be.equal(1n);
      await o.validate();

      console.log('Fine observers revoting for the leader contractor', contractors[0].runner.address);
      await observers.reduce(async (memo, b) => {
          await memo;
          console.log('Observer', b.runner.address, 'votes for', contractors[0].runner.address);
          await o.validate();
          return await (await b.observer_vote(contractors[0].runner.address)).wait();
      }, 0);
      await o.validate();

      o.state().should.eventually.be.equal(1n);

      console.log('Fine contributors revoting for the leader contractor', contractors[0].runner.address);
      await contributors.reduce(async (memo, c) => {
          await memo;
          console.log('Contributor', c.runner.address, 'votes for', contractors[0].runner.address);
          await o.validate();
          return await (await c.contributor_vote(contractors[0].runner.address)).wait();
      }, 0);
      await o.validate();

      o.state().should.eventually.be.equal(2n);
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_owner.provider.getBalance(contractors[0].runner.address);
      console.debug("Leader contractor account after contract success:", end_balance_contractor);
      console.debug("Leader contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
      console.debug("Voting cost:");

      await observers.reduce(async (memo, b) => {
          await memo;
          var diff = b.start_balance - await account_owner.provider.getBalance(b.runner.address);
          console.log('Observer', b.runner.address, diff, to$(diff));
      }, 0);

      await contributors.reduce(async (memo, c) => {
          await memo;
          var diff = c.start_balance - await account_owner.provider.getBalance(c.runner.address);
          console.log('Contributor', c.runner.address, diff, to$(diff));
      }, 0);

    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(extractData(e)));
      }
      throw e;
    }
  });
});
