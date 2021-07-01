/**
* Copyright 2017 HUAWEI. All Rights Reserved.
*
* SPDX-License-Identifier: Apache-2.0
*
* @file Implementation of the default test framework which start a test flow to run multiple tests according to the configuration file
*/


'use strict';

// global variables
const childProcess = require('child_process');
const fs = require('fs');

const exec = childProcess.exec;
const path = require('path');
const tape = require('tape');
const _test = require('tape-promise');
const test = _test(tape);
const table = require('table');
const Blockchain = require('./blockchain.js');
// const Monitor = require('./monitor.js');
//const Report  = require('./report.js');
const Client  = require('./client/client.js');
const Util = require('./util.js');
const log = Util.log;
let soloBC, raftBC, monitor, report, client;
let resultsbyround = [];    // results table for each test round
let round = 0;              // test round
let demo = require('../gui/src/demo.js');
const { loadRemoteVersion } = require('solc');
let absConfigFile, absSoloNetFile, absRaftNetFile;
let absCaliperDir = path.join(__dirname, '..', '..');
let statPath;
/**
 * print table
 * @param {Array} value rows of the table
 */
function printTable(value) {
    let t = table.table(value, {border: table.getBorderCharacters('ramac')});
    log(t);
}

function initStatJson(absConfigFile, absResultFile) {
    statPath = absResultFile;
    ensureDirectoryExistence(statPath);
    var init_json = JSON.stringify({});
    fs.writeFileSync(statPath, init_json);
    log("Creating empty stat file in " + statPath);
}


function ensureDirectoryExistence(filePath) {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
      return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
  }


/**
 * get the default result table's title
 * @return {Array} row of the title
 */
function getResultTitle() {
    // temporarily remove percentile return ['Name', 'Succ', 'Fail', 'Send Rate', 'Max Latency', 'Min Latency', 'Avg Latency', '75%ile Latency', 'Throughput'];
    return ['Name', 'Network', 'Operation', 'Succ', 'Fail', 'Send Rate', 'Max Latency', 'Min Latency', '95%ile Latency', '99%ile Latency', 'Avg Latency', 'Throughput'];
}

function getDetailedDelayTitle() {
    return ['Name', 'Network', 'Operation', 'Succ', 'Avg S2E', 'Avg E2O', 'Avg O2F', 'Avg Latency'];
}

function getDetailedDelayValue(r) {
    let row = [];
    let obj = {};
    try {
        row.push(r.label);
        row.push(r.network_name);
        row.push(r.operation);

        row.push(r.succ);
        obj.succ=r.succ;

        row.push((r.s2e_sum / r.succ).toFixed(3) + ' s');
        obj.s2e=(r.s2e_sum / r.succ).toFixed(3);

        row.push((r.e2o_sum / r.succ).toFixed(3) + ' s');
        obj.e2o=(r.e2o_sum / r.succ).toFixed(3);

        row.push((r.o2f_sum / r.succ).toFixed(3) + ' s');
        obj.o2f=(r.o2f_sum / r.succ).toFixed(3);

        row.push((r.delay_sum / r.succ).toFixed(3) + ' s');
        obj.sum=(r.delay_sum / r.succ).toFixed(3);
    }
    catch (err) {
        row = [r.label, 0, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'];
    }

    return [row, obj]
}

/**
 * get rows of the default result table
 * @param {Array} r array of txStatistics JSON objects
 * @return {Array} rows of the default result table
 */
function getResultValue(r) {
    let row = [];
    let obj = {}
    try {
        row.push(r.label);
        row.push(r.network_name);
        row.push(r.operation);

        obj.succ = r.succ;
        row.push(r.succ);

        row.push(r.fail);
        obj.fail = r.fail;
        if (r.create.max.toFixed(3) === r.create.min.toFixed(3))  {
          let send_rate = (r.succ + r.fail);
          obj.send_rate = send_rate;
          row.push( send_rate + ' tps') 
        } else {
          let send_rate = ((r.succ + r.fail) / (r.create.max - r.create.min)).toFixed(2);
          obj.send_rate = send_rate;
          row.push((send_rate + ' tps'));
        } 

        row.push(r.delay.max.toFixed(3) + ' s');
        obj.max_delay = r.delay.max.toFixed(3);
        row.push(r.delay.min.toFixed(3) + ' s');
        obj.min_delay = r.delay.min.toFixed(3);

        if(r.delay.detail.length === 0) {
            row.push('N/A');
            // row.push('N/A');
        } else {
            r.delay.detail.sort(function(a, b) { return a-b; });

            let pa95_delay=r.delay.detail[Math.floor(r.delay.detail.length * 0.95)].toFixed(3);
            row.push(pa95_delay + ' s');
            obj.pa95_delay=pa95_delay;

            let pa99_delay=r.delay.detail[Math.floor(r.delay.detail.length * 0.99)].toFixed(3);
            row.push(pa99_delay+ ' s');
            obj.pa99_delay=pa99_delay;
        }

        row.push((r.delay.sum / r.succ).toFixed(3) + ' s');
        obj.avg_delay=(r.delay.sum / r.succ).toFixed(3);

        if ((r.final.max / 1.0).toFixed(3) === (r.final.min / 1.0).toFixed(3)) { 
            row.push(r.succ + ' tps');
            obj.thruput=r.succ;
        } else {
            let thruput=((r.succ / (r.final.max - r.create.min)).toFixed(2));
            obj.thruput = thruput;
            row.push(thruput + ' tps');
        }
    }
    catch (err) {
        // temporarily remove percentile row = [r.label, 0, 0, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'];
        console.log(err);
        row = [r.label, 0, 0, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'];
        obj = {};
    }

    return [row, obj];
}

/**
 * print the performance testing results of all test rounds
 */
function printResultsByRound() {
    resultsbyround[0].unshift('Test');
    for(let i = 1 ; i < resultsbyround.length ; i++) {
        resultsbyround[i].unshift(i.toFixed(0));
    }
    log('###all test results:###');
    printTable(resultsbyround);

    // report.setSummaryTable(resultsbyround);
}


/**
 * merge testing results from various clients and store the merged result in the global result array
 * txStatistics = {
 *     succ   : ,                        // number of committed txns
 *     fail   : ,                        // number of failed txns
 *     create : {min:, max: },            // min/max time when txns were created/submitted
 *     final  : {min:, max: },            // min/max time when txns were committed
 *     delay  : {min:, max: , sum:, detail:[]},     // min/max/sum of txns' end2end delay, as well as all txns' delay
 * }
 * 
 * result = {
 *      network_name: {
 *          
 * 
 *      }
 * }
 * 
 * @param {Array} results object of results
 * @param {String} label label of the test round
 * @return {Promise} promise object
 */
function processResult(results, label){
    try {
        let stat_json = JSON.parse(fs.readFileSync(statPath));
        stat_json[label] = {};

        let all_stats = {};
        all_stats[label] = {};

        results.forEach((result) => {
            for (let [network_name, network_stats] of Object.entries(result)) {

                if (all_stats[label][network_name] === undefined) all_stats[label][network_name] = {};

                for (let [stats_name, stats] of Object.entries(network_stats)) {
                    let merged_stats = [];
                    if (all_stats[label][network_name][stats_name] !== undefined) {
                        merged_stats.push(all_stats[label][network_name][stats_name]);
                        merged_stats.push(stats);

                        if (stats_name === 'detailed_delay_stats') {
                            Blockchain.mergeDetailedDelayStats(merged_stats);
                            stats = merged_stats[0];
                        } else {
                            Blockchain.mergeDefaultTxStats(merged_stats);
                            stats = merged_stats[0];
                        }

                    }

                    all_stats[label][network_name][stats_name] = stats;
                }
            }
        });


        let result_table = [];
        let detailed_stat_table = [];
        result_table.push(getResultTitle());
        detailed_stat_table.push(getDetailedDelayTitle());

        for (let [network_name, network_stats] of Object.entries(all_stats[label])) {

            if (stat_json[label][network_name] === undefined) stat_json[label][network_name] = {};

            for (let [stats_name, stats] of Object.entries(network_stats)) {

                stats.label = label;
                stats.network_name = network_name;

                if (stats_name === 'query_stats') {
                    stats.operation = 'query';
                    let result = getResultValue(stats);
                    result_table.push(result[0]);
                    stat_json[label][network_name]['query'] = result[1];
                }

                if (stats_name === 'invoke_stats') {
                    stats.operation = 'invoke';
                    let result = getResultValue(stats);
                    result_table.push(result[0]);
                    stat_json[label][network_name]['invoke'] = result[1];
                }

                if (stats_name === 'overall_stats') {
                    stats.operation = 'overall';
                    let result = getResultValue(stats);
                    result_table.push(result[0]);
                    stat_json[label][network_name]['overall'] = result[1];
                }

                if (stats_name === 'detailed_delay_stats') {
                    stats.operation = 'invoke';
                    let result = getDetailedDelayValue(stats);
                    detailed_stat_table.push(result[0]);
                    stat_json[label][network_name]['detail'] = result[1];
                }
            }
        }

        log('###test result:###');
        printTable(result_table);
        // For the latency breakdown
        printTable(detailed_stat_table);

        let output_json = {};

        output_json[label] = stat_json[label]['simul'];

        fs.writeFileSync(statPath, JSON.stringify(output_json, null, 4));

        // if(resultsbyround.length === 0) {
        //     resultsbyround.push(resultTable[0].slice(0));
        // }
        // if(resultTable.length > 1) {
        //     let result = getResultValue('overall_stats');
        //     resultsbyround.push(result[0]);
        // }

        return Promise.resolve();
    }
    catch(err) {
        log(err);
        return Promise.reject(err);
    }
}

/**
 * load client(s) to do performance tests
 * @param {JSON} args testing arguments
 * @param {Array} clientArgs arguments for clients
 * @param {Boolean} final =true, the last test round; otherwise, =false
 * @return {Promise} promise object
 */
function defaultTest(args, clientArgs, contractID, final) {
    return new Promise( function(resolve, reject) {
        const t = global.tapeObj;
        t.comment('\n\n###### testing \'' + args.label + '\' ######');
        let testLabel   = args.label;
        let testRounds  = args.txDuration ? args.txDuration : args.txNumber;
        let tests = []; // array of all test rounds
        let soloCfgPath = path.relative(absCaliperDir, absSoloNetFile);
        let raftCfgPath = path.relative(absCaliperDir, absRaftNetFile);
        for(let i = 0 ; i < testRounds.length ; i++) {
            let msg = {
                type: 'test',
                label : args.label,
                rateControl: args.rateControl[i] ? args.rateControl[i] : {type:'fixed-rate', 'opts' : {'tps': 1}},
                trim: args.trim ? args.trim : 0,
                args: args.arguments,
                cb  : args.callback,
                soloConfig: soloCfgPath,
                raftConfig: raftCfgPath,
                contractID: contractID
            };
            // condition for time based or number based test driving
            if (args.txNumber) {
                msg.numb = testRounds[i];
            } else if (args.txDuration) {
                msg.txDuration = testRounds[i];
            } else {
                return reject(new Error('Unspecified test driving mode'));
            }

            tests.push(msg);
        }
        let testIdx = 0;
        return tests.reduce( function(prev, item) {
            return prev.then( () => {
                log('----test round ' + round + '----');
                round++;
                testIdx++;
                item.roundIdx = round; // propagate round ID to clients
                demo.startWatch(client);

                return client.startTest(item, clientArgs, processResult, testLabel).then(async () => {
                    demo.stopWatch();
                    // return raftBC.getBlockNumAsync();
                    // t.pass('passed \'' + testLabel + '\' testing' + " with " + blk_num + " blocks");
                    // let stat_json = JSON.parse(fs.readFileSync(statPath));
                    // stat_json[testLabel]['blk_num'] = blk_num;
                    // fs.writeFileSync(statPath, JSON.stringify(stat_json, null, 4));
                }).then(() => {
                    if (final && testIdx === tests.length) {
                        return Promise.resolve();
                    } else {
                        log('wait 5 seconds for next round...');
                        return Util.sleep(5000)
                    }
                }).catch( (err) => {
                    demo.stopWatch();
                    t.fail('failed \''  + testLabel + '\' testing, ' + (err.stack ? err.stack : err));
                    return Promise.reject(err);   // Not allow to continue with next round
                });
            });
        }, Promise.resolve()).then( () => {
            return resolve();
        }).catch( (err) => {
            t.fail(err.stack ? err.stack : err);
            return reject(new Error('defaultTest failed'));
        });
    });
}

/**
 * Start a default test flow to run the tests
 * @param {String} configFile path of the test configuration file
 * @param {String} networkFile path of the blockchain configuration file
 */
module.exports.run = function(configFile, networkFiles, resultFile) {
    test('#######Caliper Test######', (t) => {
        global.tapeObj = t;
        absConfigFile  = Util.resolvePath(configFile);
        absSoloNetFile = Util.resolvePath(networkFiles[0]);
        absRaftNetFile = Util.resolvePath(networkFiles[1]);

        initStatJson(absConfigFile, resultFile);

        soloBC = new Blockchain(absSoloNetFile);
        raftBC = new Blockchain(absRaftNetFile);
        //monitor = new Monitor(absConfigFile);
        client  = new Client(absConfigFile);
        //createReport();
        demo.init();
        let contractID;
        let config = require(absConfigFile);
        let startPromise = new Promise((resolve, reject) => {
            if (config.hasOwnProperty('command') && config.command.hasOwnProperty('start')){
                log(config.command.start);
                let child = exec(config.command.start, {cwd: absCaliperDir}, (err, stdout, stderr) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve();
                });
                child.stdout.pipe(process.stdout);
                child.stderr.pipe(process.stderr);
            }
            else {
                resolve();
            }
        });
        if (!config.hasOwnProperty('contracts')) {
            reject(new Error("No smart contract config in client config file."));
        } 
        let contracts_config = config.contracts;
        startPromise.then(async () => {
            await soloBC.init();
            await raftBC.init();
            await soloBC.installSmartContract(contracts_config);
            return await raftBC.installSmartContract(contracts_config);
        }).then((contract_id) => {
            contractID = contract_id;
            log("Installed ContractID: " + contractID + "\n" );
            return client.init().then(async (number) => {
                await soloBC.prepareClients(number);
                return await raftBC.prepareClients(number);
            });
        }).then( (clientArgs) => {

            let allTests  = require(absConfigFile).test.rounds;
            let testIdx   = 0;
            let testNum   = allTests.length;
            return allTests.reduce( (prev, item) => {
                return prev.then( () => {
                    ++testIdx;
                    return defaultTest(item, clientArgs, contractID, (testIdx === testNum));
                });
            }, Promise.resolve());
        }).then( () => {
            log('----------finished test----------\n');
            // printResultsByRound();
            return Promise.resolve();
        }).then( () => {
            client.stop();
            if (config.hasOwnProperty('command') && config.command.hasOwnProperty('end')){
                log(config.command.end);
                let end = exec(config.command.end, {cwd: absCaliperDir});
                end.stdout.pipe(process.stdout);
                end.stderr.pipe(process.stderr);
            }
            t.end();
            process.exit();
        // }).then( () => {
        }).catch( (err) => {
            log('unexpected error, ' + (err.stack ? err.stack : err));
            let config = require(absConfigFile);
            if (config.hasOwnProperty('command') && config.command.hasOwnProperty('end')){
                log(config.command.end);
                let end = exec(config.command.end, {cwd: absCaliperDir});
                end.stdout.pipe(process.stdout);
                end.stderr.pipe(process.stderr);
            }
            t.end();
            process.exit(1);
        });
    });
};
