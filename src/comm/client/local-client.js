/**
* Copyright 2017 HUAWEI. All Rights Reserved.
*
* SPDX-License-Identifier: Apache-2.0
*
*/

'use strict';

const { promises } = require('fs');
// global variables
const bc   = require('../blockchain.js');
const RateControl = require('../rate-control/rateControl.js');
const TxStatus = require('../transaction.js');
const Util = require('../util.js');
const log  = Util.log;

let soloBC;
let raftBC;
let txUpdateInter;
let soloResults = [];
let raftResults = [];
let soloTxNum = 0;
let raftTxNum = 0;
let soloTxLastNum = 0;
let raftTxLastNum = 0;

let allStats = {
    simul: {},
    solo: {},
    raft: {}
};

let txUpdateTime = 500;
let trimType = 0;
let trim = 0;
let startTime = 0;


function generateStats(prev_stats, results) {

    let invokeStats = [];  // invoke stats
    let queryStats = [];  // query stats
    let resultStats = [];  // overall stats
    let detailedDelayStats = [];  // delay for invoke stats

    if (prev_stats['query_stats'] !== undefined) queryStats.push(prev_stats['query_stats']);
    if (prev_stats['invoke_stats'] !== undefined) invokeStats.push(prev_stats['invoke_stats']);
    if (prev_stats['overall_stats'] !== undefined) resultStats.push(prev_stats['overall_stats']);
    if (prev_stats['detailed_delay_stats'] !== undefined) detailedDelayStats.push(prev_stats['detailed_delay_stats']);

    let newQueryTxnStatuses = [];
    let newInvokeTxnStatuses = [];
    results.forEach(function(newTxnStatus) {
        if (newTxnStatus.Get("operation") === "query") {
            newQueryTxnStatuses.push(newTxnStatus);
        } else if (newTxnStatus.Get("operation") === "invoke") {
            newInvokeTxnStatuses.push(newTxnStatus);
        } else {
            console.log("Unrecognized txn operation type");
        }
    });

    let newQueryStats;
    if (newQueryTxnStatuses.length === 0) {
        newQueryStats = bc.createNullDefaultTxStats();
    } else {
        newQueryStats = bc.getDefaultTxStats(newQueryTxnStatuses, true);
    }

    let newInvokeStats;
    let newDetailedDelayStats;
    if (newInvokeTxnStatuses.length === 0) {
        newInvokeStats = bc.createNullDefaultTxStats();
        newDetailedDelayStats = bc.createNullDetailedDelayStats();
    } else {
        newInvokeStats = bc.getDefaultTxStats(newInvokeTxnStatuses, true);
        newDetailedDelayStats = bc.getDetailedDelayStats(newInvokeTxnStatuses, false)
    }


    let newStats;
    if(results.length === 0) {
        newStats = bc.createNullDefaultTxStats();
    } else {
        newStats = bc.getDefaultTxStats(results, true);
    }

    if (queryStats.length === 0) {
        switch (trimType) {
        case 0: // no trim
            queryStats.push(newQueryStats);
            break;
        case 1: // based on duration
            if (trim < (Date.now() - startTime)/1000) {
                queryStats[0] = newQueryStats;
            }
            break;
        case 2: // based on number
            if (trim < 0) {
                queryStats[0] = newQueryStats;
            }            
            break;
        }
    } else {
        queryStats.push(newQueryStats);
        // bc.mergeDefaultTxStats(queryStats);
    }


    if (invokeStats.length === 0) {
        switch (trimType) {
        case 0: // no trim
            invokeStats.push(newInvokeStats);
            detailedDelayStats.push(newDetailedDelayStats);
            break;
        case 1: // based on duration
            if (trim < (Date.now() - startTime)/1000) {
                invokeStats[0] = newInvokeStats;
                detailedDelayStats[0] = newDetailedDelayStats;
            }
            break;
        case 2: // based on number
            if (trim < 0) {
                invokeStats[0] = newInvokeStats;
                detailedDelayStats[0] = newDetailedDelayStats;
            }
            break;
        }
    } else {
        invokeStats.push(newInvokeStats);
        detailedDelayStats.push(newDetailedDelayStats);
        // bc.mergeDefaultTxStats(invokeStats);
        // bc.mergeDetailedDelayStats(detailedDelayStats);
    }

    if (resultStats.length === 0) {
        switch (trimType) {
        case 0: // no trim
            resultStats.push(newStats);
            break;
        case 1: // based on duration
            if (trim < (Date.now() - startTime)/1000) {
                resultStats[0] = newStats;
            }
            break;
        case 2: // based on number
            if (trim < 0) {
                resultStats[0] = newStats;
            } else {
                trim -= newResults.length;
            }
            break;
        }
    } else {
        resultStats.push(newStats);
        // bc.mergeDefaultTxStats(resultStats);
    }

    // remove empty stats for each category
    bc.mergeDefaultTxStats(queryStats);
    bc.mergeDefaultTxStats(invokeStats);
    bc.mergeDefaultTxStats(resultStats);
    bc.mergeDetailedDelayStats(detailedDelayStats);

    let stats = {};

    if (queryStats.length > 0) stats['query_stats'] = queryStats[0];
    if (invokeStats.length > 0) stats['invoke_stats'] = invokeStats[0];
    if (resultStats.length > 0) stats['overall_stats'] = resultStats[0];
    if (detailedDelayStats.length > 0) stats['detailed_delay_stats'] = detailedDelayStats[0];

    return stats;
}

/**
 * Calculate realtime transaction statistics and send the txUpdated message
 */
function txUpdate() {
    let soloNewNum = soloTxNum - soloTxLastNum;
    let raftNewNum = raftTxNum - raftTxLastNum;
    soloTxLastNum = soloTxNum;
    raftTxLastNum = raftTxNum;

    let newSoloResults = soloResults.slice(0);
    let newRaftResults = raftResults.slice(0);
    soloResults = [];
    raftResults = [];

    let newTxNum = soloNewNum + raftNewNum;

    let newStats;
    newStats = bc.createNullDefaultTxStats();

    let data = {};
    // results is an array of txnstatus
    if (newSoloResults.length !== 0) {
        allStats.solo = generateStats(allStats.solo, newSoloResults);
    }

    if (newRaftResults.length !== 0) {
        allStats.raft = generateStats(allStats.raft, newRaftResults);
    }

    if (newSoloResults.length !== 0 && newRaftResults.length !== 0) {
        let results = combineResults(newSoloResults, newRaftResults);
        allStats.simul = generateStats(allStats.simul, results);
    }

    if (newSoloResults.length !== 0 || newRaftResults.length !== 0) {
        newStats = bc.getDefaultTxStats([...newSoloResults, ...newRaftResults], false);
    }

    data['committed'] = newStats;
    data['submitted'] = newTxNum;

    process.send({type: 'txUpdated', data});

}

function combineResults(resultsA, resultsB) {
    let resultsC = [];

    if (resultsA.length !== resultsB.length) throw new Error("size of both results arrays has to be the same")

    for (let i = 0; i < resultsA.length; ++i) {
        if (resultsA[i].IsCommitted() && resultsB[i].IsCommitted()) {
            let oldResultA = resultsA[i];
            let oldResultB = resultsB[i];

            let commitTime = oldResultA.Get("time_commit");
            let orderTime = oldResultA.Get("time_order");
            let proposalDuration = commitTime - orderTime;

            let newResult = oldResultB.clone();
            newResult.Set("time_commit", proposalDuration + oldResultB.Get("time_commit"));

            resultsC.push(newResult);
        }
    }

    return resultsC;
}

/**
 * Add new test result into global array
 * @param {Array} result test result, should be an array
 */
function addResult(result) {
    let i = 0;
    while (i < result.length) {
        soloResults.push(result[i]);
        raftResults.push(result[i + 1]);
        i = i + 2;
    }
}

/**
 * Call before starting a new test
 * @param {JSON} msg start test message
 */
function beforeTest(msg) {
    // conditionally trim beginning and end results for this test run
    if (msg.trim) {
        if (msg.txDuration) {
            trimType = 1;
        } else {
            trimType = 2;
        }
        trim = msg.trim;
    } else {
        trimType = 0;
    }
}

/**
 * Clear the update interval
 */
function clearUpdateInter(updateInterval) {
    // stop reporter
    clearInterval(updateInterval);
    txUpdate();
};

/**
 * Callback for new submitted transaction(s)
 * @param {Number} count count of new submitted transaction(s)
 */
function submitSoloCallback(count) {
    soloTxNum += count;
}

function submitRaftCallback(count) {
    raftTxNum += count;
}

/**
 * Perform test with specified number of transactions
 * @param {JSON} msg start test message
 * @param {Object} cb callback module
 * @param {Object} context blockchain context
 * @return {Promise} promise object
 */
async function runFixedNumber(msg, cb, contexts) {
    log('Info: client ' + process.pid +  ' start test runFixedNumber()' + (cb.info ? (':' + cb.info) : ''));

    try {

        let blockchains = [soloBC, raftBC];
        let rateControl = new RateControl(msg.rateControl, soloBC);
        rateControl.init(msg);
        
        await cb.init(blockchains, contexts, msg.args);
        
        startTime = Date.now();

        let promises = [];

        let txCount = 0;
        while (txCount < msg.numb) {
            promises.push(
                new Promise(async (resolve) => {
                    await rateControl.applyRateControl(startTime, txCount, null, null);

                    let results = await cb.run();
                    addResult(results);
                    resolve();
                })
            );
            ++txCount;
        }

        await Promise.all(promises);
        await rateControl.end();
        await soloBC.releaseContext(contexts[0]);
        await raftBC.releaseContext(contexts[1]);
        return Promise.resolve();
    } catch(err) {
        return Promise.reject("Failed running fixed number of transactions");
    }

}

/**
 * Perform test with specified test duration
 * @param {JSON} msg start test message
 * @param {Object} cb callback module
 * @param {Object} context blockchain context
 * @return {Promise} promise object
 */
async function runDuration(msg, cb, context) {
    log('Info: client ' + process.pid +  ' start test runDuration()' + (cb.info ? (':' + cb.info) : ''));
    let rateControl = new RateControl(msg.rateControl, blockchain);
    rateControl.init(msg);
    const duration = msg.txDuration; // duration in seconds

    await cb.init(blockchain, context, msg.args);
    startTime = Date.now();

    let promises = [];
    while ((Date.now() - startTime)/1000 < duration) {
        promises.push(cb.run().then((result) => {
            addResult(result);
            return Promise.resolve();
        }));
        await rateControl.applyRateControl(startTime, txNum, results, resultStats);
    }
    blockchain.finishIssueTxn();
    await Promise.all(promises);
    await rateControl.end();
    return await blockchain.releaseContext(context);
}

/**
 * Perform the test
 * @param {JSON} msg start test message
 * @return {Promise} promise object
 */
async function doTest(msg) {
    try {
        log('doTest() with:', msg);
        let cb = require(Util.resolvePath(msg.cb));
        soloBC = new bc(Util.resolvePath(msg.soloConfig));
        raftBC = new bc(Util.resolvePath(msg.raftConfig));
        let clientIdx = msg.hostIdx * msg.clients + msg.clientIdx;
        beforeTest(msg);
        // start an interval to report results repeatedly
        txUpdateInter = setInterval(txUpdate, txUpdateTime);

        // Start listening for block events from two blockchain networks
        const soloRegistration = await soloBC.registerBlockProcessing(clientIdx, (err) => {
            clearUpdateInter(txUpdateInter);
            process.send({type: 'error', data: err.toString()});
        });

        const raftRegistration = await raftBC.registerBlockProcessing(clientIdx, (err) => {
            clearUpdateInter(txUpdateInter);
            process.send({type: 'error', data: err.toString()});
        });

        let soloContext = await soloBC.getContext(msg.label, msg.clientargs, clientIdx);
        let raftContext = await raftBC.getContext(msg.label, msg.clientargs, clientIdx);

        if (soloContext === undefined) {
            soloContext = {};
        }

        if (raftContext === undefined) {
            raftContext = {};
        }

        soloContext.engine = {
            submitCallback: submitSoloCallback
        };
        soloContext.clientIdx = clientIdx;
        soloContext.op_numb = msg.numb;
        soloContext.contractID = msg.contractID;

        raftContext.engine = {
            submitCallback: submitRaftCallback
        };
        raftContext.clientIdx = clientIdx;
        raftContext.op_numb = msg.numb;
        raftContext.contractID = msg.contractID;

        let contexts = [soloContext, raftContext];

        if (msg.txDuration) {
            await runDuration(msg, cb, contexts);
        } else {
            await runFixedNumber(msg, cb, contexts);
        }

        await soloBC.unRegisterBlockProcessing(soloRegistration.blk_event_hub, soloRegistration.blk_registration);
        await raftBC.unRegisterBlockProcessing(raftRegistration.blk_event_hub, raftRegistration.blk_registration);

        clearUpdateInter(txUpdateInter);
        cb.end();

        return Promise.resolve(allStats);
    } catch (err) {
        clearUpdateInter(txUpdateInter);
        log('Client ' + process.pid + ': error ' + (err.stack ? err.stack : err));
        return Promise.reject(err);
    }
}

/**
 * Message handler
 */
process.on('message', function(message) {
    if (message.hasOwnProperty('type')) {
        try {
            switch(message.type) {
                case 'test': {
                    doTest(message).then((output) => {
                        process.send({type: 'testResult', data: output});
                    });
                    break;
                }
                default: {
                    process.send({type: 'error', data: 'unknown message type'});
                }
            }
        } catch(err) {
            process.send({type: 'error', data: err.toString()});
        }
    } else {
        process.send({type: 'error', data: 'unknown message type'});
    }
});
