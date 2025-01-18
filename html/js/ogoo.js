const createMap = function() {
    // Creates a Map using pairs of the arguments
    var r = new Map();
    for(var i=0; i < arguments.length - 1; i += 2) {
        r.set(arguments[i], arguments[i + 1]);
    }
    return r;
}

const WeiSymbol = 'w';

const etherUnits = [
    WeiSymbol,
    'K' + WeiSymbol,
    'M' + WeiSymbol,
    'G' + WeiSymbol,
    'mk' + ethers.EtherSymbol,
    'm' + ethers.EtherSymbol,
    ethers.EtherSymbol,
    'K' + ethers.EtherSymbol,
    'M' + ethers.EtherSymbol,
    'G' + ethers.EtherSymbol,
    'T' + ethers.EtherSymbol,
]

const timeUnits = {
    'sec': 1,
    'min': 60,
    'hours': 60*60,
    'days': 60*60*24,
    'weeks': 60*60*24*7,
}

const bigIntSplit = function(amount, digits=3) {
    var len = amount.toString().length;
    var len3 = Math.ceil(len / digits);
    var ret = [];
    var delim = 10n ** BigInt(digits);
    for(var i=0; i < len3; i += 1) {
        ret.push(amount % delim);
        amount = amount / delim;
    }
    if(ret[ret.length - 1] == 0n) {
        ret.pop();
    }
    return ret;
}

const bigIntUnsplit = function(split, digits=3) {
    var ret = 0n;
    var delim = 10n ** BigInt(digits);
    for(var i=0; i < split.length; i++) {
        ret += split[i] * (delim ** BigInt(i));
    }
    return ret;
}

const bigIntSplitRound = function(splitted, parts=null, digits=3) {
    if(parts == 0)
        return splitted;
    var _splitted = Array.from(splitted);
    if(parts == null) {
        parts = _splitted.length - 1;
    }
    var delim = 10n ** BigInt(digits);
    var i;

    if(_splitted[parts - 1] >= delim / 2n)
        _splitted[parts] += 1n;
    for(i=0; i < parts && i < _splitted.length - 1; i += 1) {
        _splitted[i] = 0n;
    }
    return _splitted;
}

const bigIntRound = function(amount, digits) {
    return bigIntUnsplit(bigIntSplitRound(bigIntSplit(amount, 1), digits, 1), 1);
}

const etherFormatApprox = function(amount, parts=2) {
    var ret = '';
    var i;
    var splitted = bigIntSplit(amount);
    // fillup extra-teraethers
    while(splitted.length > etherUnits.length) {
        splitted[splitted.length - 2] += splitted[splitted.length - 1] * 1000n;
        splitted.splice(-1);
    }
    // round-up lower parts
    if(splitted.length > parts) {
        splitted = bigIntSplitRound(splitted, splitted.length - parts);
    }
    // fillup return value
    for(i = splitted.length - 1; i >= splitted.length - parts && i >= 0; i -= 1) {
        if(splitted[i] > 0n) {
            if(ret.length > 0) {
                ret += ' ';
            }
            ret += splitted[i].toString() + etherUnits[i];
        }
    }
    return ret;
};

const convertToWei = function(value, unit_index=0) {
    var int, frac;
    [sint, sfrac] = value.toString().split('.');
    if(typeof(sfrac) == 'undefined')
        sfrac = '';
    var bint = BigInt(sint + sfrac);

    if(sfrac.length > 0) {
        if(sfrac.length > unit_index * 3) {
            bint = (bigIntRound(bint, sfrac.length - unit_index * 3) / (10n ** BigInt(sfrac.length - unit_index * 3)));
        } else {
            bint = bint * (10n ** BigInt(unit_index * 3 - sfrac.length));
        }
    } else {
        bint = bint * (10n ** BigInt(unit_index * 3 - sfrac.length));
    }
    return bint;
};

const convertFromWei = function(value, unit_index=0) {
    var swei = value.toString();
    var sint;
    var sfrac;
    if(swei.length > unit_index * 3) {
        sint = swei.substr(0, swei.length - unit_index * 3);
        sfrac = swei.substr(swei.length - unit_index * 3, swei.length); 
    } else {
        sint = '0';
        sfrac = '0'.repeat(unit_index * 3 - swei.length) + swei;
    }
    if( BigInt(sfrac) > 0n ) {
        for(var i = sfrac.length-1; i >= 0; i -= 1) {
            if(sfrac.substr(i, i+1) == '0')
                sfrac = sfrac.substr(0, i);
            else
                break;
        }
        return sint + '.' + sfrac;
    }
    return sint;
}

const get_database = async function() {
    return await new Promise(function(resolve, reject) {
        var request = indexedDB.open('ogoo', 1);
        request.onerror = (ex) => {
            console.error('Error open ogoo database', ex);
            bootstrap.Modal.getOrCreateInstance($('#no-database')[0], {
                keyboard: false,
            }).show();
            if( ex.originalTarget && ex.originalTarget.error) {
                reject(new Error('Database error', {cause: ex.originalTarget.error}));
            } else {
                reject(new Error(ex.toString()));
            }
        }
        request.onupgradeneeded = (event) => {
            console.debug('OGOO DB upgrade ' + event.oldVersion + ' -> ' + event.newVersion)
            const db = event.target.result;
            const offers_store = db.createObjectStore("offers", { keyPath: "id" });
        }
        request.onsuccess = (event) => {
            console.debug('OGOO DB opened successfully')
            const db = event.target.result;
            resolve(db);
        }
    });
};

const get_offers_list = async function() {
    var offers_list = [];
    var db = await get_database();
    return await new Promise(function (resolve, reject) {
        const objectStore = db.transaction("offers").objectStore("offers");
        objectStore.openCursor().addEventListener("success", (e) => {
            const cursor = e.target.result;
            if (cursor) {
                console.debug('OGOO DB read offers line', cursor.value)
                offers_list.push(cursor.value.id);
                cursor.continue();
            } else {
                resolve(offers_list);
            }
        });
    });
};

const add_offer_to_list = async function(id) {
    var db = await get_database();
    var current_account = get_current_account();
    if( !current_account ) {
        console.error('No current account selected');
        throw new Error('No current account selected', {cause: 'NO_ACCCOUNT'});
    }
    var offer_access = new ethers.Contract(
        id,
        offer_abi.abi,
        current_account
    );
    try {
        var state = await offer_access.state();
    } catch(ex) {
        console.error('Error adding a new offer. Is it a proper Offer contract address?', id, ex);
        throw ex;
    }
    return await new Promise(function(resolve, reject) {
        const objectStore = db.transaction(["offers"], "readwrite").objectStore("offers");
        const request = objectStore.add({id: id});
        request.onerror = function(ex) {
            console.error('Error inserting offer id into ogoo database', id, ex);
             if( ex.originalTarget && ex.originalTarget.error) {
                reject(new Error('Database error', {cause: ex.originalTarget.error}));
            } else {
                reject(new Error(ex.toString()));
            }
        };
        request.onsuccess = function(event) {
            console.debug('Offer added', id);
            resolve(true);
        };
    });
};

const delete_offer_from_list = async function(id) {
    var db = await get_database();
    return await new Promise(function(resolve, reject) {
        const objectStore = db.transaction(["offers"], "readwrite").objectStore("offers");
        const request = objectStore.delete(id);
        request.onerror = function(event) {
            console.error('Error deleting offer id from ogoo database', id, event);
            reject(event);
        };
        request.onsuccess = function(event) {
            console.debug('Offer deleted', id);
            resolve(true);
        };
    });
};

const bs_selectPane = function(selector) {
    var pane$ = $(selector);
    pane$.parent().find('.tab-pane').removeClass('active show');
    pane$.addClass('active show');
    $('[data-bs-toggle="tab"]').removeClass('active show');
    $(`[data-bs-target="${selector}"][data-bs-toggle="tab"]`).addClass('active show');
}

const edit_offer = async function(address) {
    var hash = document.location.hash;
    var params = new URLSearchParams(hash.substring(1));
    params.set('pane', 'edit-offer');
    params.set('address', address);
    document.location.hash = '#' + params.toString().replaceAll('+', ' ');
}

var offer_abi;  // loaded dynamically
var OfferState = [ // enum OfferState
    'INITIAL',
    'APPROVED',
    'COMPLETED',
    'FAILED',
];

// TODO: resolve providers if many
// window.addEventListener(
//  "eip6963:announceProvider",
//  (event) => {
//      console.log("!!!!", event);
//      ethereum = event.detail.provider;
//      event.detail.info.uuid;
//      event.detail.info.name;
//      event.detail.info.rdns;
//      event.detail.info.icon; // URL
//});
//window.dispatchEvent(new Event("eip6963:requestProvider"));

var provider = new ethers.BrowserProvider(ethereum, 'any');

// get all offers accordingly to the current account
const get_offer_records_list = async function(current_account) {
    if( !current_account )
        return [];
    return (await Promise.allSettled((await get_offers_list()).map(async id => {
        var offer_record = {};
        offer_record.id = id;
        var offer_access = new ethers.Contract(
            offer_record.id,
            offer_abi.abi,
            current_account
        );
        try {
            [
                offer_record.owner,
                offer_record.is_contributor,
                offer_record.is_observer,
                offer_record.state,
                offer_record.definition,
                offer_record.contribution,
                offer_record.amount,
            ] = await Promise.all([
                offer_access.owner(),
                offer_access.is_origin_contributor(),
                offer_access.is_origin_observer(),
                offer_access.state(),
                offer_access.definition(),
                offer_access.contribution_get_for_origin(),
                provider.getBalance(offer_record.id),
            ]);
            offer_record.definition = (offer_record.definition).toObject();
            offer_record.state_name = OfferState[offer_record.state];
            offer_record.is_owner = (offer_record.owner == current_account.address);
        } catch(ex) {
            console.error('Error reading the Offer data. Is it a proper Offer contract address?', offer_record.id, ex);
            throw ex;
        }
        console.debug('Offer read:', offer_record);
        return offer_record;
    }))).filter(result => result.status == 'fulfilled').map(result => result.value);
};

const get_current_account = function() {
    var selector = $('#accounts-list');
    var offer_records = [];
    if( selector.children().length > 0 )
        return selector[0].selectedOptions[0].account;
}

const get_current_account_async = async function() {
    const delay = ms => new Promise(res => setTimeout(res, ms));
    while(true) {
        var ret = get_current_account();
        if( ret )
            return ret;
        await delay(1000);
    }
}

const fill_offer_lists = async function() {
    var current_account = get_current_account();
    var offer_records = await get_offer_records_list(current_account);
    $('#all-offers-number').text(offer_records.length);
    var contributions = 0;
    var observed = 0;
    var owned = 0;

    var offer_list_tbody = $('#offers-list tbody');
    offer_list_tbody.html('');
    var contribution_list_tbody = $('#contributions-list tbody');
    contribution_list_tbody.html('');
    var observing_list_tbody = $('#observing-list tbody');
    observing_list_tbody.html('');
    var managed_list_tbody = $('#managed-offers-list tbody');
    managed_list_tbody.html('');
    for(var i in offer_records) {
        var offer_record = offer_records[i];
        var offer_list_row = $($('#offer-list-row').text());
        offer_list_row.find('.offer-list-row-address').text(offer_record.id);
        offer_list_row.find('.offer-list-row-name').text(offer_record.definition.caption);
        var offer_list_row_icon_box = offer_list_row.find('.offer-list-row-icon-box');

        if(offer_record.is_owner) {
            owned += 1;
            offer_list_row_icon_box.append($($('#icon-owner').text()));

            var managed_list_row = $($('#managed-list-row').text());
            managed_list_row.find('.managed-list-row-address').text(offer_record.id);
            managed_list_row.find('.managed-list-row-name').text(offer_record.definition.caption);
            var managed_list_row_icon_box = managed_list_row.find('.managed-list-row-icon-box');
            managed_list_row_icon_box.append($($('#icon-state-' + offer_record.state_name).text()));
            managed_list_tbody.append(managed_list_row);

        }
        if(offer_record.is_contributor) {
            contributions += 1;
            offer_list_row_icon_box.append($($('#icon-contributor').text()));

            var contribution_list_row = $($('#contribution-list-row').text());
            contribution_list_row.find('.contribution-list-row-address').text(offer_record.id);
            contribution_list_row.find('.contribution-list-row-name').text(offer_record.definition.caption);
            contribution_list_row.find('.contribution-list-row-contribution').text('≊' + etherFormatApprox(offer_record.contribution));
            contribution_list_row.find('.contribution-list-row-contribution').attr('title',ethers.formatEther(offer_record.contribution) + ethers.EtherSymbol);
            var contribution_list_row_icon_box = contribution_list_row.find('.contribution-list-row-icon-box');
            contribution_list_row_icon_box.append($($('#icon-state-' + offer_record.state_name).text()));
            contribution_list_tbody.append(contribution_list_row);
        }
        if(offer_record.is_observer) {
            observed += 1;
            offer_list_row_icon_box.append($($('#icon-observer').text()));

            var observing_list_row = $($('#observing-list-row').text());
            observing_list_row.find('.observing-list-row-address').text(offer_record.id);
            observing_list_row.find('.observing-list-row-name').text(offer_record.definition.caption);
            var observing_list_row_icon_box = observing_list_row.find('.observing-list-row-icon-box');
            observing_list_row_icon_box.append($($('#icon-state-' + offer_record.state_name).text()));
            observing_list_tbody.append(observing_list_row);
        }
        offer_list_row_icon_box.append('&nbsp;');
        offer_list_row_icon_box.append($($('#icon-state-' + offer_record.state_name).text()));
        offer_list_tbody.append(offer_list_row);
    }
    $('#all-contributions-number').text(contributions);
    $('#all-observed-number').text(observed);
    $('#all-owned-number').text(owned);
};

const address_input_check = async function(id) {
    var input = $('#' + id);
    var form = input.parentsUntil('form').parent();
    var addr = input.val();
    if( !addr || !addr.length ) {
        form.removeClass('was-validated');
        return;
    }
    if( !form.hasClass('was-validated') ) {
        form.addClass('was-validated');
    }
    if( !await ethers.isAddress(addr.toLowerCase()) ) {
        input[0].setCustomValidity('Address invalid');
    } else {
        input[0].setCustomValidity('');
    }
}

const durationHuman = function(seconds) {
    if( !seconds )
        return '0';
    var v = luxon.Duration.fromObject({
        seconds: Number(seconds)
    }).shiftTo('seconds', 'minutes', 'hours', 'days', 'weeks');
    var o = v.toObject();
    var v = {};
    for(var k in o) {
        if(o[k])
            v[k] = o[k];
    }
    return luxon.Duration.fromObject(v).toHuman();
};

const etherHuman = function(wei) {
    var v = etherFormatApprox(wei, 20);
    if( v.length == 0 )
        v = '0';
    return v;
};

const etherExactHuman = function(wei) {
    // returns amount string and unit index
    if( wei == 0n ) {
        return ['0', 6];
    }
    v = bigIntSplit(wei);
    for(var i=0; i < v.length; i++) {
        if( v[i] != 0 ) {
            return [bigIntUnsplit(v.slice(i)).toString(), i];
        }
    }
    return ['error', 0];
};

$(async function() {
    if( typeof(ethereum) == "undefined" ) {
        bootstrap.Modal.getOrCreateInstance($('#no-ethereum')[0], {
            keyboard: false,
        }).show();
        return;
    }

    offer_abi = await $.ajax(url='/ogoo.sol/Offer.json');
    var update_accounts = async function() {
        var accounts = await provider.listAccounts();
        var accounts_list$ = $('#accounts-list');
        var old_value = accounts_list$.val();
        accounts_list$.empty();
        if( accounts.length == 0 ) {
            bootstrap.Modal.getOrCreateInstance($('#no-accounts')[0]).show();
        } else {
            for(var i in accounts) {
                var account = accounts[i];
                var amount = await provider.getBalance(account.address);
                var option = document.createElement('option');
                var address = account.address;
                option.innerHTML = address.substr(0,6)+'...' + address.substr(-4) + '≊' + etherFormatApprox(amount);
                option.title = address + ': ' + ethers.formatEther(amount) + ethers.EtherSymbol;
                option.value = address;
                option.account = account;
                accounts_list$.append(option);
            }
            if(accounts.find(x => x.address == old_value)) {
                accounts_list$.val(old_value);
            } else {
                await fill_offer_lists();
            }
        }
    };

    // Copy the entire create-offer tab content to have a similar edit-offer tab
    $('#edit-offer').html($('#create-offer').html());

    $('form.needs-validation').on('submit', event => {
        // initiale validation on submit for all forms
        if (!event.target.checkValidity()) {
            event.preventDefault();
            event.stopPropagation();
        }
        $(event.target).addClass('was-validated')
    });

    
    
    {
        // initiate units selectors for amounts
        var input_amount_unit$ = $('.input-amount-unit');
        input_amount_unit$.empty();
        for(var i in etherUnits) {
            var unit = etherUnits[i];
            var option = `<option title="${unit}" value=${i}>${unit}</option>`;
            var option$ = input_amount_unit$.append(option);
            for(var j=0; j < option$.length; j++) {
                option$[j].index = i;
            }
        }
        for(var i=0; i < input_amount_unit$.length; i++) {
            var hidden$ = $(input_amount_unit$[i]).parent().find('input[type="hidden"]');
            if(hidden$.val())
                $(input_amount_unit$[i]).val(hidden$.val());
            else
                $(input_amount_unit$[i]).val(3);
        }

        input_amount_unit$.on('change', function(event) {
            var old_unit = Number($(event.currentTarget)[0].old_value);
            var new_unit = Number($(event.currentTarget).val());
            var change = old_unit - new_unit;
            var input$ = $(event.currentTarget).parent().find('input.form-control');
            var hidden$ = $(event.currentTarget).parent().find('input[type="hidden"]');
            if( input$.val() ) {
                var wei = convertToWei(input$.val(), old_unit);
                input$.val(convertFromWei(wei, new_unit));
            }
            $(event.currentTarget)[0].old_value = $(event.currentTarget).val();
            hidden$.val($(event.currentTarget).val());
        });
        input_amount_unit$.on('focus', function(event) {
            $(event.currentTarget)[0].old_value = $(event.currentTarget).val();
        });
    }

    {
        // initiate units selectors for timeouts
        var input_timeout_unit$ = $('.input-timeout-unit');
        input_timeout_unit$.empty();
        for(var i in timeUnits) {
            var multiplier = timeUnits[i];
            var option = `<option title="${i}" value=${multiplier}>${i}</option>`;
            var option$ = input_timeout_unit$.append(option);
            for(var j=0; j < option$.length; j++) {
                option$[j].multiplier = multiplier;
            }
        }
        for(var i=0; i < input_timeout_unit$.length; i++) {
            var hidden$ = $(input_timeout_unit$[i]).parent().find('input[type="hidden"]');
            if(hidden$.val())
                $(input_timeout_unit$[i]).val(hidden$.val());
            else
                $(input_timeout_unit$[i]).val(60*60*24);
        }

        input_timeout_unit$.on('change', function(event) {
            var change = Number($(event.currentTarget)[0].old_value) / Number($(event.currentTarget).val());
            var input$ = $(event.currentTarget).parent().find('input.form-control');
            var hidden$ = $(event.currentTarget).parent().find('input[type="hidden"]');
            if( input$.val() ) {
                input$.val(Number(input$.val()) * change);
            }
            $(event.currentTarget)[0].old_value = $(event.currentTarget).val();
            hidden$.val($(event.currentTarget).val());
        });
        input_timeout_unit$.on('focus', function(event) {
            $(event.currentTarget)[0].old_value = $(event.currentTarget).val();
        });
    }
    {
        // initiate markdown preview for markdown input
        const _update_md = function(src$) {
            var markdown$ = src$.parentsUntil(':has(".markdown")').parent().find('.markdown');
            var md = new remarkable.Remarkable('full', {
                html: true,
                breaks: true,
                typographer:  true,
            });
            markdown$.html(md.render(src$.val()));
        };
        $(document).on('input', '.markdown-source', function(event) {
            _update_md($(event.target));
        });
        $('.markdown-source').map(function(i, element) {
            _update_md($(element));
        });
    }
    $(document).on('click', '.offer-share-button', async function(event) {
        // All offer share buttons
        var share_dialog = $('#share-offer');
        var offer_address = $(event.currentTarget).parents('tr').find('.offer-address').text();
        share_dialog.find('.share-offer-qr').html('').qrcode(offer_address);
        share_dialog.find('.share-offer-address').html('').text(offer_address);

        bootstrap.Modal.getOrCreateInstance(share_dialog[0]).show();
    });
    $(document).on('click', '.offer-remove-button', async function(event) {
        var offer_address = $(event.currentTarget).parents('tr').find('.offer-address').text();
        await delete_offer_from_list(offer_address);
        await fill_offer_lists();
    });
    $(document).on('change', '#accounts-list', async function(event) {
        // value change of the current account field leads to rereading offer lists
        await fill_offer_lists();
    });

    $('#connect-account-button').on('click', async function(event) {
        // initial connect to the wallet plugin
        $('#connect-account-button').prop('disabled', true);
        try {
            await ethereum.request({method:'eth_requestAccounts'});
        } catch(ex) {
            console.log('Account connection failed:', ex);
            $('#connect-account-button').prop('disabled', false);
            $('#no-accounts .dialog-error').text('Account connection failed:' + ex.message);
            return;
        }
        bootstrap.Modal.getOrCreateInstance($('#no-accounts')[0]).hide();
        $('#no-accounts .dialog-error').text('');
        $('#connect-account-button').prop('disabled', false);
    });

    {
        // main page card buttons
        $('#offers-card-offers-button').on('click', async function(event) {
            event.preventDefault();
            bs_selectPane('#offers-list');
        });
        $('#contributions-card-contributions-button').on('click', async function(event) {
            event.preventDefault();
            bs_selectPane('#contributions-list');
        });
        $('#observing-card-observers-button').on('click', async function(event) {
            event.preventDefault();
            bs_selectPane('#observing-list');
        });
        $('#manage-card-managed-button').on('click', async function(event) {
            event.preventDefault();
            bs_selectPane('#managed-offers-list');
        });
        $('#manage-card-create-offer-button').on('click', async function(event) {
            event.preventDefault();
            bs_selectPane('#create-offer');
        });
    }
    {
        // wallet change state tracking
        ethereum.on('connect', async function() {
            console.debug("Wallet connect", arguments);
            await update_accounts();
        });
        ethereum.on('disconnect', async function() {
            console.debug("Wallet disconnect", arguments);
            await update_accounts();
        });
        ethereum.on('accountsChanged', async function() {
            console.debug("Wallet accounts list changed", arguments);
            await update_accounts();
        })
        ethereum.on('chainChanged', async function() {
            console.debug("Wallet chain connection changed", arguments);
            await update_accounts();
        })
    }
    $('#watch-offer').on('submit', async function(event) {
        // add offer dialogue submit
        event.preventDefault();
        try {
            await add_offer_to_list($('#watch-offer-address').val());
        } catch(ex) {
            var err = ex.message;
            if(ex.code == 'BAD_DATA') {
                err = 'No such offer. Is it a proper Offer address?';
            } else {
                if(ex.cause.name == 'ConstraintError') {
                    err = 'The Offer is already in the list'
                } else {
                    err = ex.cause.message;
                }
            }
            $('#watch-offer .dialog-error').text(err);
            return;
        }
        await fill_offer_lists();
        bootstrap.Modal.getOrCreateInstance($('#watch-offer')[0]).hide();
    });
    $('#create-offer form').on('submit', async function(event) {
        // create offer page submit
        event.preventDefault();
        var $form = $(event.target);
        if( !event.target.checkValidity() )
            return false;
        var definition = {
            caption: $form.find('.input-caption').val(),
            contribution_min_balance: convertToWei(
                $form.find('.input-contribution-min-balance').val(),
                Number($form.find('.input-contribution-min-balance ~ select').val())
            ),
            contribution_unlock_timeout: (
                BigInt($form.find('.input-contribution-unlock-timeout').val() * 10) *
                BigInt($form.find('.input-contribution-unlock-timeout ~ select').val()) / 10n
            ),
            observer_award: 0n,
            voting_start_balance: convertToWei(
                $form.find('.input-voting-start-balance').val(),
                Number($form.find('.input-voting-start-balance ~ select').val())
            ),
            voting_start_count: BigInt($form.find('.input-voting-start-count').val()),
            voting_start_timeout: (
                BigInt($form.find('.input-voting-start-timeout').val() * 10) *
                BigInt($form.find('.input-voting-start-timeout ~ select').val()) / 10n
            ),
            voting_fail_timeout: (
                BigInt($form.find('.input-voting-fail-timeout').val() * 10) *
                BigInt($form.find('.input-voting-fail-timeout ~ select').val()) / 10n
            ),
            observers_vote_percent: (
                BigInt($form.find('.input-observers-vote-percent').val() * 100)
            ),
            contributors_vote_percent: (
                BigInt($form.find('.input-contributors-vote-percent').val() * 100)
            ),
            contributors_vote_fund_percent: (
                BigInt($form.find('.input-contributors-vote-fund-percent').val() * 100)
            ),
            description: $form.find('.input-description').val(),
            full_details: $form.find('.input-full-details').val(),
        };
        console.log('Create Offer Submit', definition);
        var dialogue$ = $('#create-offer-submit');
        var current_account = get_current_account();
        dialogue$.find('form')[0].definition = definition;
        dialogue$.find('form')[0].current_account = current_account;
        var balance = await provider.getBalance(current_account.address);
        var dialogue = bootstrap.Modal.getOrCreateInstance(dialogue$[0]).show(); 
        dialogue$.find('.modal-header h1').text('Create a new Offer');
        dialogue$.find('.current-account-id').text(current_account.address.substr(0, 6) + '...' + current_account.address.substr(-4));
        dialogue$.find('.current-account-balance').text(etherFormatApprox(balance));

        dialogue$.find('.input-caption').text(definition.caption);
        dialogue$.find('.input-contribution-min-balance').text(etherHuman(definition.contribution_min_balance));
        dialogue$.find('.input-contribution-unlock-timeout').text(durationHuman(definition.contribution_unlock_timeout));
        dialogue$.find('.input-voting-start-balance').text(etherHuman(definition.voting_start_balance));
        dialogue$.find('.input-voting-start-count').text(definition.voting_start_count);
        dialogue$.find('.input-voting-start-timeout').text(durationHuman(definition.voting_start_timeout));
        dialogue$.find('.input-voting-fail-timeout').text(durationHuman(definition.voting_fail_timeout));
        dialogue$.find('.input-observers-vote-percent').text(Number(definition.observers_vote_percent) / 100 + '%');
        dialogue$.find('.input-contributors-vote-percent').text(Number(definition.contributors_vote_percent) / 100 + '%');
        dialogue$.find('.input-contributors-vote-fund-percent').text(Number(definition.contributors_vote_fund_percent) / 100 + '%');
        var md = new remarkable.Remarkable('full', {
            html: true,
            breaks: true,
            typographer:  true,
        });
        dialogue$.find('.input-description').html(md.render(definition.description));
        dialogue$.find('.input-full-details').html(md.render(definition.full_details));
    });
    $('#create-offer-submit form').on('submit', async function(event) {
        // create offer dialogue submit
        event.preventDefault();
        var form$ = $(event.target);
        var definition = form$[0].definition;
        var current_account = form$[0].current_account;
        var dialogue$ = form$.parentsUntil('.modal').parent();
        var modal_info$ = dialogue$.find('.modal-footer .modal-info');
        form$.find('button').prop('disabled', true);
        modal_info$.text('Waiting for deploy...');
        try {
            var Offer = new ethers.ContractFactory(offer_abi.abi, offer_abi.bytecode, current_account);
            var offer = await Offer.deploy(definition);
            modal_info$.text('Waiting for transaction...');
            await offer.waitForDeployment();
            modal_info$.text('');
            console.log('Offer deployed:', offer);
            try {
                await add_offer_to_list(offer.target);
            } catch(ex) {
                var err = ex.message;
                if(ex.code == 'BAD_DATA') {
                    err = 'No such offer. Is it a proper Offer address?';
                } else {
                    if(ex.cause.name == 'ConstraintError') {
                        err = 'The Offer is already in the list'
                    } else {
                        err = ex.cause.message;
                    }
                }
                modal_info$.text('Error: '+ err.toString());
                return;
            }
            await fill_offer_lists();
        } catch(ex) {
            modal_info$.text('Error: ' + ex.toString());
        }
        form$.find('button').prop('disabled', false);
    });

    const on_edit_offer = async function() {
        var params = new URLSearchParams(document.location.hash.substring(1));
        var address = params.get('address');
        var current_account = await get_current_account_async();
        var offer_record = {
            id: address
        };

        var offer_access = new ethers.Contract(
            address,
            offer_abi.abi,
            current_account
        );
        try {
            [
                offer_record.owner,
                offer_record.is_contributor,
                offer_record.is_observer,
                offer_record.state,
                offer_record.definition,
                offer_record.contribution,
                offer_record.amount,
            ] = await Promise.all([
                offer_access.owner(),
                offer_access.is_origin_contributor(),
                offer_access.is_origin_observer(),
                offer_access.state(),
                offer_access.definition(),
                offer_access.contribution_get_for_origin(),
                provider.getBalance(offer_record.id),
            ]);
            offer_record.definition = (offer_record.definition).toObject();
            offer_record.state_name = OfferState[offer_record.state];
            offer_record.is_owner = (offer_record.owner == current_account.address);
        } catch(ex) {
            console.error('Error reading the Offer data. Is it a proper Offer contract address?', offer_record.id, ex);
            // TODO: UI message
            return;
        }
        console.debug('Offer read:', offer_record);

        var edit_offer$ = $('#edit-offer');
        edit_offer$.find('input.input-caption').val(offer_record.definition.caption);
        {
            var v = etherExactHuman(offer_record.definition.contribution_min_balance);
            edit_offer$.find('input.input-contribution-min-balance').val(v[0]);
            edit_offer$.find('input.input-contribution-min-balance ~ .input-amount-unit').val(v[1]);
        }

        if( offer_record.is_owner && offer_record.state == 1n ) {
            edit_offer$.find('.tab-pane-header').text(`Edit Offer ${address}`);
            edit_offer$.find('form button[type="submit"]').text('Update Offer');
            edit_offer$.find('form .form-control').prop('readonly', false);
            edit_offer$.find('form .form-select').prop('readonly', false);
            edit_offer$.find('form button[type="submit"]').prop('disabled', false);
            edit_offer$.find('form button[type="submit"]').removeClass('invisible');
        } else {
            edit_offer$.find('.tab-pane-header').text(`View Offer ${address}`);
            edit_offer$.find('form button[type="submit"]').text('');
            edit_offer$.find('form .form-control').prop('readonly', true);
            edit_offer$.find('form .form-select').prop('readonly', true);
            edit_offer$.find('form button[type="submit"]').prop('disabled', true);
            edit_offer$.find('form button[type="submit"]').addClass('invisible');
        }
    };

    $('#edit-offer form').on('submit', async function(event) {
        // edit offer page submit
        event.preventDefault();
        console.log('>>> Edit Offer Submit');
    });
    
    {
        // add offer dialogue scanner initializing
        var scanner;
        (new MutationObserver(async function(event) {
            if( !scanner ) {
                if( !await QrScanner.hasCamera() ) {
                    $('#watch-offer video').addClass('d-none');
                    $('#watch-offer .video-absent').text('Camera not found, use text input instead');
                } else {
                    $('#watch-offer .video-absent').text('');
                    var v = $('#watch-offer video');
                    v.removeClass('d-none');
                    scanner = new QrScanner(v[0], async function(result) {
                        $('#watch-offer-address').val(result.data);
                        await address_input_check('watch-offer-address');
                        if( scanner.started ) {
                            scanner.started = false;
                            await scanner.stop();
                        }
                        v.addClass('d-none');
                    }, {
                        highlightScanRegion:true,
                        highlightCodeOutline: true,
                        returnDetailedScanResult: true
                    });
                    scanner.started = false;
                }
            }
            if( $('#watch-offer').hasClass('show') ) {
                $('#watch-offer .dialog-error').text('');
                await address_input_check('watch-offer-address');
                if( scanner && !scanner.started ) {
                    try {
                        scanner.started = true;
                        await scanner.start();
                    } catch(ex) {
                        $('#watch-offer video').addClass('d-none');
                        console.error('Scanner can not start', ex);
                        scanner.destroy();
                        scanner = null;
                        $('#watch-offer .video-absent').text('Scanner can not start:' + ex);
                    }
                }
            } else {
                if( scanner && scanner.started ) {
                    scanner.started = false;
                    await scanner.stop();
                }
            }
        })).observe($('#watch-offer')[0], {
            subtree:false,
            attributeFilter:['class']
        });
    }

    {
        // selected pane to hash synchronization
        var panes$ = $('.tab-pane');
        for(var ip=0; ip < panes$.length; ip++) {
            (new MutationObserver(function(events) {
                for(var event of events) {
                    var pane$ = $(event.target);
                    var oldClasses = new Map(event.oldValue.split(' ').map(x=>[x, x]));
                    if(pane$.hasClass('active') && !('active' in oldClasses)) {
                        var hash = document.location.hash;
                        var params = new URLSearchParams(hash.substring(1));
                        params.set('pane', pane$.attr('id'));
                        var new_hash = '#' + params.toString().replaceAll('+', ' ');
                        if( hash != new_hash ) {
                            document.location.hash = new_hash;
                        }
                    }
                }
            })).observe(panes$[ip], {
                subtree:false,
                attributeFilter:['class'],
                attributeOldValue:true,
            });
        }
        const onhashchange = async function() {
            var params = new URLSearchParams(document.location.hash.substring(1));
            var selector = `#${params.get('pane')}`;
            if( $(selector).length > 0 ) {
                bs_selectPane(selector);
            }
            if(selector == '#edit-offer') {
                await on_edit_offer();
            }
        };
        $(window).on('hashchange', onhashchange);
        onhashchange();
    }

    await update_accounts();
});
