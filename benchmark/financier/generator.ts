import { Task } from './types'

let prob = require("prob.js");

export let info: string = "Financier's Generator";
let soloBC: any;
let raftBC: any;
let soloCtx: any;
let raftCtx: any;
let nTxn: number;
let nAccount: number;
let sleepMS: number;
let nRead: number;
let nWrite: number;
let updateSize: number;
let zipfs: number;

function getSampler(n: number): any {
    return Math.random() * n;
}

function getZipfSampler(n: number, s: number): any {
    return prob.zipf(s, n);
}

function getUniformSampler(n: number): any {
    return prob.uniform(0, n);
}

function getAccount(accountSampler) {
    return "A" + Math.floor(accountSampler()).toString(10);
}

function generateTasks(nTxn: number, nAccount: number, sleepMS: number, nRead: number, nWrite: number, updateSize: number, zipfs?: number) {
    let tasks: any[] = [];
    let sampler: any;
    
    if (zipfs === undefined) {
        sampler = getUniformSampler(nAccount);
    } else {
        sampler = getZipfSampler(nAccount - 1, zipfs);
    }

    for (let i = 0; i < nTxn; i++) {
        let readKeys: string[] = [];
        let writeKeys: string[] = [];
        for (let j = 0; j < nRead; j++) {
            let accountName: string = getAccount(sampler);
            readKeys.push(accountName);
        }

        for (let j = 0; j < nWrite; j++) {
            let accountName: string = getAccount(sampler);
            writeKeys.push(accountName);
        }

        let task: any = {
            sleepMS,
            nRead,
            nWrite,
            updateSize,
            readKeys,
            writeKeys,
            "transaction_type": "readAndWrite"
        };

        tasks.push(task);

    }

    return tasks;

}

export async function run() {

    let tasks: Task[] = generateTasks(nTxn, nAccount, sleepMS, nRead, nWrite, updateSize, zipfs);
    let output: any[] = [];
    let statuses: any[];

    // Send the same task to solo-based and raft-based blockchain networks, respectively
    statuses = await soloBC.invokeSmartContract(soloCtx, soloCtx.contractID, 'v0', tasks);
    output.push(...statuses);
    statuses = await raftBC.invokeSmartContract(raftCtx, raftCtx.contractID, 'v0', tasks);
    output.push(...statuses);

    return output;
}

export function init(blockchains: any[], contexts: any[], args: any) {
    if (blockchains === undefined || contexts === undefined || args === undefined) {
        return Promise.reject("Required more arguments");
    }

    if (blockchains.length !== 2) {
        return Promise.reject("Required more arguments");
    }

    soloBC = blockchains[0];
    raftBC = blockchains[1];

    soloCtx = contexts[0];
    raftCtx = contexts[1];
    nTxn = args.nTxn;
    sleepMS = args.sleepMS;
    nAccount = args.nAccount;
    nRead = args.nRead;
    nWrite = args.nWrite;
    updateSize = args.updateSize;
    
    if (args.zipfs !== undefined) { 
        zipfs = args.zipfs;
    }

    return Promise.resolve();
};

export function end() {
    return Promise.resolve();
}
