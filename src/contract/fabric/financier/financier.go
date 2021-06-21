package main

import (
	"errors"
	"fmt"
	"time"
	"strings"
	"strconv"
	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

type Financier struct {
}

var logger *shim.ChaincodeLogger

func (f *Financier) Init(stub shim.ChaincodeStubInterface) pb.Response {

	_, args := stub.GetFunctionAndParameters()

	if len(args) != 2 {
		return shim.Error("Received more than 1 argument required")
	}

	nRecords, err := strconv.Atoi(args[0])

	recordSize, err := strconv.Atoi(args[1])
	if err != nil {
		return shim.Error("Failed to convert type string to int")
	}

	err = initData(stub, nRecords, recordSize)
	if err != nil {
		return shim.Error("Failed to generate initial data")
	}

	return shim.Success([]byte("Successful"))
}

func initData(stub shim.ChaincodeStubInterface, nRecords int, recordSize int) error {

	// Build a string record
	var sbuilder strings.Builder
	for i := 0; i < recordSize; i++ {
		sbuilder.WriteString("i")
	}

	recordBytes := []byte(sbuilder.String())

	count := 0

	for i := 0; i < nRecords; i++ {
		
		var sbuilder strings.Builder
		sbuilder.WriteString("A")
		sbuilder.WriteString(strconv.Itoa(i))

		key := sbuilder.String()

		err := stub.PutState(key, recordBytes)
		if err != nil {
			logger.Error("Error inserting a key-value pair")
			break
		}
	
		count++
	}

	err := stub.PutState("nRecords", []byte(strconv.Itoa(count)));
	if err != nil {
		return errors.New("Error inserting # of records")
	}

	logger.Infof("# of records inserted: %d", count)

	return nil
}

func (f *Financier) Invoke(stub shim.ChaincodeStubInterface) pb.Response {
	
	fn, args := stub.GetFunctionAndParameters()

	var err error
	var result []byte

	switch fn {
	case "readAndWrite":
		result, err = readAndWrite(stub, args)
	default:
		return shim.Error("Function does not exist")
	}

	if err != nil {
		return shim.Error(fmt.Sprintf("Unable to invoke function: %v; %v", fn, err.Error()))
	}

	return shim.Success(result);
}

func readAndWrite(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	if len(args) < 4 {
		logger.Errorf("Incorrect number of arguments: %d, required at least 3", len(args))
		return nil, errors.New("Incorrect number of arguments")
	}
	
	i := 0

	sleepMillisecond, err := strconv.Atoi(args[i])
	i++
	
	nReads, err := strconv.Atoi(args[i])
	i++

	nWrites, err := strconv.Atoi(args[i])
	i++

	updateSize, err := strconv.Atoi(args[i])
	i++

	if err != nil {
		return nil, errors.New("Failed to convert type string to int")
	}

	if sleepMillisecond < 0 {
		return nil, errors.New("Unable to accept negative value for sleep time")
	}

	readStart := i
	readEnd := readStart + nReads - 1
	i = i + nReads

	writeStart := i
	writeEnd := writeStart + nWrites - 1
	i = i + nWrites

	total := 4 + nReads + nWrites
	if len(args) != total {
		logger.Errorf("Incorrect number of arguments: %d, required total %d", len(args), total)
		return nil, errors.New("Incorrect number of arguments")
	}
	
	time.Sleep(time.Duration(sleepMillisecond) * time.Millisecond)

	for j := readStart; j <= readEnd; j++ {
		
		key := args[j]
		valBytes, err := stub.GetState(key)
		if err != nil {
			logger.Errorf("Not found with key: %v", key)
			continue
		}

		logger.Infof("Retrieving value: %v with key: %v", string(valBytes), key)
	}

	// Build a string of updateSize
	var sbuilder strings.Builder
	for j := 0; j < updateSize; j++ {
		sbuilder.WriteString("w")
	}

	updateBytes := []byte(sbuilder.String())

	for j := writeStart; j <= writeEnd; j++ {

		key := args[j]
		err := stub.PutState(key, updateBytes)
		if err != nil {
			return nil, fmt.Errorf("Unable to upsert with key: %v", key)
		}

		logger.Infof("Value updated with key: %v", key)
	}

	return []byte("Successful"), nil
}

func main() {
	logger = shim.NewLogger("Financier")

	if err := shim.Start(new(Financier)); err != nil {
		logger.Info("Error starting chaincode")
	}
}

