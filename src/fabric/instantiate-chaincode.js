/**
 * Modifications Copyright 2017 HUAWEI
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

//const utils = require('fabric-client/lib/utils.js');
//const logger = utils.getLogger('E2E instantiate-chaincode');

//const tape = require('tape');
//const _test = require('tape-promise');
//const test = _test(tape);

const e2eUtils = require('./e2eUtils.js');
const testUtil = require('./util.js');

module.exports.run = function(chaincodes_config, config_path) {
    const settings = require(config_path).fabric;
    const policy = settings['endorsement-policy'];  // TODO: support mulitple policies
    // Copy array
    let chaincodes = chaincodes_config;
    if (typeof chaincodes === 'undefined' || chaincodes.length === 0) {
        return Promise.resolve();
    }

    return new Promise(async (resolve, reject) => {
        // test('\n\n***** instantiate chaincode *****\n\n', (t) => {
        const t = global.tapeObj;
        t.comment('Instantiate chaincode......');

        let promises = [];
        let chaincodeNames = [];

        chaincodes.forEach((chaincode) => {

            let chaincodeCopy = { ...chaincode }

            let channel;

            if (!chaincodeCopy.hasOwnProperty("channel")) {
                // channel field in chaincode will be later used as the channel name in e2eUtils
                channel = testUtil.getDefaultChannel(settings.channel);
                chaincodeCopy.channel = channel.name;
            } else {
                channel = testUtil.getChannel(settings.channel, chaincodeCopy.channel);
            }

            promises.push(e2eUtils.instantiateChaincode(settings,  channel.organizations[0], chaincodeCopy, policy, false));

            chaincodeNames.push(chaincodeCopy.id);
        });

        try {
            await Promise.all(promises);
            t.pass('Instantiated chaincode ' + chaincodeNames.reduce((prev, curr) => prev + curr, '') + ' successfully ');
            resolve();
        } catch (err) {
            t.fail('Failed to instantiate chaincodes, ' + (err.stack?err.stack:err));
            reject(new Error('Fabric: instantiate chaincodes failed'));
        }
    });
};
