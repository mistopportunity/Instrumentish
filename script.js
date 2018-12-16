const audioContext = new (window.AudioContext||window.webkitAudioContext)();

const preventDefaultDrag = event => {
    event.preventDefault();
}
const fileDropped = event => {
    event.preventDefault();
    if(event.dataTransfer.items) {
        for(let i=0;i<event.dataTransfer.items.length;i++) {
            if(event.dataTransfer.items[i].kind === "file") {
                const file = event.dataTransfer.items[i].getAsFile();
                processFile(file);
            }
        }
        event.dataTransfer.items.clear();
    } else {
        for(let i=0;i<event.dataTransfer.files.length;i++) {
            const file = event.dataTransfer.files[i];
            processFile(file);
        }
        event.dataTransfer.clearData();
    }
}
const processFile = file => {
    switch(file.type) {
        case "audio/mp3":
        case "audio/ogg":
        case "audio/wav":
            const reader = new FileReader();
            reader.onload = event => {
                addAudioSource(event.target.result,file.name);
            }
            reader.readAsArrayBuffer(file);
            break;
    }
}

const addAudioSource = (audioData,fileName) => {
    audioContext.decodeAudioData(
        audioData,
        audioBuffer => {
            const control = createFileSourceControl(nodeIDCounter,fileName);
            if(control) {
                nodeDictionary[control.id] = {
                    type: "file-source-control",
                    name: fileName,
                    element: control,
                    id: control.id,
                    buffer: audioBuffer,
                    source: null,
                    playing: false,
                    paused: false,
                    looping: false,
                    outputs: {},
                };
                nodeTable.appendChild(control);
                nodeIDCounter++;
                console.log(`Added '${fileName}' to node dictionary`);
            } else {
                console.log(`Failed to create DOM for '${fileName}'`);
            }

        },
        () => {
            console.error(`Failure to decode '${fileName}' as an audio file`);
        }
    );
}

let nodeIDCounter = 0;

const volumeControlFactor = 1000 * 2;

const nodeTable = document.getElementById("node-table");
const nodeSelector = document.getElementById("node-selector");

const masterNode = document.getElementById("node-master");
const masterNodePin = masterNode.children[0];

const connectorToolButton = document.getElementById("connector-tool");
const disconnectorToolButton = document.getElementById("disconnector-tool");
const binderToolButton = document.getElementById("binder-tool");
const deleterToolButton = document.getElementById("deleter-tool");

let toolMode = "connect";
connectorToolButton.classList.add("selected");

const clearPinQueue = () => {
    if(pinQueue) {
        pinQueue.element.removeChild(pinQueue.pinLabel);
        pinQueue = null;
    }
}

const clickedConnector = function() {
    if(toolMode === "connect") {
        return;
    }
    clearPinQueue();
    connectorToolButton.classList.add("selected");
    binderToolButton.classList.remove("selected");
    disconnectorToolButton.classList.remove("selected");
    deleterToolButton.classList.remove("selected");
    toolMode = "connect";
};

const clickedDisconnector = function() {
    if(toolMode === "disconnect") {
        return;
    }
    clearPinQueue();
    disconnectorToolButton.classList.add("selected");
    connectorToolButton.classList.remove("selected");
    binderToolButton.classList.remove("selected");
    deleterToolButton.classList.remove("selected");
    toolMode = "disconnect";
}

const clickedBinder = function() {
    if(toolMode === "binder") {
        return;
    }
    clearPinQueue();
    binderToolButton.classList.add("selected");
    disconnectorToolButton.classList.remove("selected");
    connectorToolButton.classList.remove("selected");
    deleterToolButton.classList.remove("selected");
    toolMode = "bind";
}

const clickedDeleter = function() {
    if(toolMode === "deleter") {
        return;
    }
    clearPinQueue();
    deleterToolButton.classList.add("selected");
    binderToolButton.classList.remove("selected");
    disconnectorToolButton.classList.remove("selected");
    connectorToolButton.classList.remove("selected");
    toolMode = "delete";
}

masterNodePin.onclick = event => {
    inputPinClicked(masterNode.id,masterNodePin);
}

const nodeDictionary = {
    "node-master": {
        id: "node-master",
        type: "master",
        element: masterNode,
        name: "master node",
        inputs: {}
    }
};

const addNode =  function() {
    let newNode, dictionaryEntry = {};
    switch(nodeSelector.selectedOptions[0].value) {
        case "volume-control":
            dictionaryEntry.type = "volume-control";
            dictionaryEntry.name = "volume control";
            dictionaryEntry.gainNode = audioContext.createGain();
            dictionaryEntry.inputs = {};
            dictionaryEntry.outputs = {};
            newNode = createVolumeControl(
                nodeIDCounter,
                dictionaryEntry.name
            );
            break;
        case "output-switch":
            dictionaryEntry.type = "output-switch";
            dictionaryEntry.leftOutputs = {};
            dictionaryEntry.rightOutputs = {};
            dictionaryEntry.inputs = {};

            dictionaryEntry.leftOutputNode = audioContext.createAnalyser();
            dictionaryEntry.rightOutputNode = audioContext.createAnalyser();
            dictionaryEntry.inputNode = audioContext.createAnalyser();

            dictionaryEntry.name = "output switch";
            newNode = createSwitch(
                nodeIDCounter,
                dictionaryEntry.name,
            );
            break;
        case "input-switch":
            dictionaryEntry.type = "input-switch";
            dictionaryEntry.leftInputs = {};
            dictionaryEntry.rightInputs = {};
            dictionaryEntry.outputs = {};

            dictionaryEntry.leftInputNode = audioContext.createAnalyser();
            dictionaryEntry.rightInputNode = audioContext.createAnalyser();
            dictionaryEntry.outputNode = audioContext.createAnalyser();

            dictionaryEntry.name = "input switch";
            newNode = createSwitch(
                nodeIDCounter,
                dictionaryEntry.name,
            );
            break
    }
    if(newNode) {
        dictionaryEntry.element = newNode;
        dictionaryEntry.id = newNode.id;
        nodeDictionary[newNode.id] = dictionaryEntry;
        nodeTable.appendChild(newNode);
        nodeIDCounter++;
    }
};

const applySourceControlOutputs = node => {
    //Disconnect the buffer source node from the ouputs manually or does WebAudio GC handle it?
    for(let [outputKey,output] of Object.entries(node.outputs)) {
        genericConnect({
                node: node,
                switchIndex: -1
            },{
                node: nodeDictionary[outputKey],
                switchIndex: output.switchIndex
            },false
        );
    }
}

const applySourceControlEndEvent = (node,button1,button2) => {
    node.source.onended = () => {
        if(!node.paused && node.source) {
            resetSourceControl(node,button1,button2);
        }
    }
}

const sourceControlButton1 = (nodeID,button1,button2) => {
    const node = nodeDictionary[nodeID];
    if(node.playing) {
        if(node.paused) {
            button1.textContent = "pause"
            node.paused = false;
            node.source = audioContext.createBufferSource();
            node.source.buffer = node.buffer;
            if(node.looping) {
                node.source.loop = true;
            }
            node.timePaused += (audioContext.currentTime - node.pauseStart);
            applySourceControlOutputs(node);
            applySourceControlEndEvent(node,button1,button2);
            console.log("Pause time start: " + node.pausedTime);
            node.source.start(audioContext.currentTime,node.pausedTime);//paused time isn't applying correctly
        } else {
            button1.textContent = "play";
            node.paused = true;
            node.pauseStart = audioContext.currentTime;
            node.pausedTime = (audioContext.currentTime - node.startTime - node.timePaused) % node.buffer.duration;
            node.source.stop();
            node.source = null;
        }
    } else {
        button1.textContent = "pause";
        button2.textContent = "stop";
        node.playing = true;
        node.startTime = audioContext.currentTime;
        node.timePaused = 0;
        node.source = audioContext.createBufferSource();
        node.source.buffer = node.buffer;
        applySourceControlOutputs(node);
        applySourceControlEndEvent(node,button1,button2);
        node.source.start();
    }

}

const resetSourceControl = (node,button1,button2) => {
    button1.textContent = "play";
    button2.textContent = "loop";
    node.playing = false;
    node.looping = false;
    if(!node.paused) {
        node.source.stop();
        node.source = null;
    }
    node.paused = false;
}

const sourceControlButton2 = (nodeID,button1,button2) => {
    const node = nodeDictionary[nodeID];
    if(node.playing) {
        resetSourceControl(node,button1,button2);
    } else {
        button1.textContent = "pause";
        button2.textContent = "stop";
        node.timePaused = 0;
        node.playing = true;
        node.looping = true;
        node.source = audioContext.createBufferSource();
        node.source.loop = true;
        node.source.buffer = node.buffer;
        applySourceControlOutputs(node);
        node.source.start();
        node.startTime = audioContext.currentTime;
    }
}

const nameUpdated = (nodeID,newName) => {
    nodeDictionary[nodeID].name = newName;
}

const setSwitchState = (nodeID,isInputType,condition) => {

    const node = nodeDictionary[nodeID];

    if(isInputType) { //input switch - switches inputs

        if(condition) { //change from left to right

        } else { //change from right to left

        }

    } else { //output switch - switches outputs

        if(condition) { //change from left to right

        } else { //change from left to right

        }

    }


    //TODO.
    console.log(nodeID,isInputType,condition);
}
const updateVoumeNode = (nodeID,value) => {
    nodeDictionary[nodeID].gainNode.gain.setValueAtTime(value / volumeControlFactor, audioContext.currentTime);
}

const getPinEnumeration = (pinIndex) => {
    //TODO.
    return "abcdefghijlmnopqrstuvwxyz"[pinIndex];
}

let = pinQueue = null;
let pinIndex = 0;

const createPinLabel = (nodeID,pinIndex) => {
    const p = document.createElement("p");
    const pText = document.createTextNode(
        getPinEnumeration(pinIndex)
    );
    p.appendChild(pText);
    p.id = `${nodeID}-${pinIndex}`;
    p.className = "connection";
    return p;
}

const processPinClick = (nodeID,element,switchIndex=-1,isInput,connectMethod,disconnectMethod) => {
    let type, inverseType;
    if(isInput) {
        type = "input";
        inverseType = "output";
    } else {
        type = "output";
        inverseType = "input";
    }
    if(toolMode === "connect") {
        if(element.children.length >= 5) {
            return;
        }
        if(nodeID === masterNode.id) {
            element = masterNode.children[0];
        }
        if(!pinQueue) {
            const pinLabel = createPinLabel(nodeID,pinIndex);
            pinQueue = {
                type: type,
                id: nodeID,
                element: element,
                pinLabel: pinLabel,
                switchIndex: switchIndex
            }
            element.appendChild(pinLabel);
        } else {
            if(pinQueue.type === type) {
                pinQueue.element.removeChild(pinQueue.pinLabel);

                if(pinQueue.element === element) {
                    pinQueue = null;
                    return;
                }

                const pinLabel = createPinLabel(nodeID,pinIndex);
                pinQueue = {
                    type: type,
                    id: nodeID,
                    element: element,
                    pinLabel: pinLabel,
                    switchIndex: switchIndex
                }
                element.appendChild(pinLabel);
                
            } else if(pinQueue.type === inverseType) {
                if(pinQueue.id === nodeID) {
                    pinQueue.element.removeChild(pinQueue.pinLabel);
                    pinQueue = null;
                    return;
                }
                element.appendChild(
                    createPinLabel(nodeID,pinIndex)
                );
                connectMethod(
                    nodeDictionary[pinQueue.id],
                    nodeDictionary[nodeID],
                    pinQueue.switchIndex,
                    switchIndex
                );
                pinIndex++;
                pinQueue = null;
            }
        }
    } else if(toolMode === "disconnect") {
        disconnectMethod(nodeDictionary[nodeID]);
    }
}
const normalizeNode = abstractNode => {
    let inputs = null;
    let outputs = null;
    let inputAudioNode = null;
    let outputAudioNode = null;
    switch(abstractNode.node.type) {
        case "output-switch":

        inputs = abstractNode.node.inputs;
        inputAudioNode = abstractNode.node.inputNode;

        if(abstractNode.switchIndex === 0) {
            outputs = abstractNode.node.leftOutputs;
            outputAudioNode = leftOutputNode;

        } else if(abstract.switchIndex === 1) {
            outputs = abstractNode.node.rightOutputs;
            outputAudioNode = abstractNode.node.rightOutputNode;

        } else {
            console.error("Error: Confusing switch index on output switch");
        }
        //Tracking schema: leftOutputs, rightOutputs, inputs

        //Input node: inputNode
        //Output nodes: leftOutputNode, rightOutputNode
        break;
    case "input-switch":

        outputs = abstractNode.node.outputs;
        outputAudioNode = abstractNode.node.outputNode;

        if(abstractNode.switchIndex === 0) {
            inputs = abstractNode.node.leftInputs;
            inputAudioNode = leftInputNode;

        } else if(abstract.switchIndex === 1) {
            inputs = abstractNode.node.rightInputs;
            outputAudioNode = abstractNode.node.rightInputNode;
            
        } else {
            console.error("Error: Confusing switch index on input switch");
        }
        //Tracking schema: leftInputs, rightInputs, outputs

        //Input node: outputNode
        //Output nodes: leftInputNode, rightInputNode
        break;
    case "volume-control":
        //Tracking schema: outputs, inputs

        inputAudioNode = abstractNode.node.gainNode;
        outputAudioNode = abstractNode.node.gainNode;

        outputs = abstractNode.node.outputs;
        inputs = abstractNode.node.inputs;

        //Input node: gainNode
        //Output node: gainNode
        break;
    case "file-source-control":
        //Tracking schema: outputs

        outputs = abstractNode.node.outputs;
        outputAudioNode = abstractNode.node.source;

        //Output node: source
        break;
    case "master":
        inputAudioNode = audioContext.destination;
        inputs = abstractNode.node.inputs;

        //Tracking schema: inputs

        //Input node: audioContext.destination
        break;
    }
    return {
        inputAudioNode: inputAudioNode,
        outputAudioNode: outputAudioNode,
        inputs: inputs,
        outputs: outputs
    }

}

const genericDisconnect = (input,output,unmapDictionaries=true) => {
    //Todo
}

const genericConnect = (input,output,mapDictionaries=true) => {

    const genericInput = normalizeNode(output);
    const genericOutput = normalizeNode(input);

    if(genericInput.inputAudioNode && genericOutput.outputAudioNode) {
        genericOutput.outputAudioNode.connect(genericInput.inputAudioNode);
    } else {
        console.warn("Warning: Normalized node IO is missing audio node(s)");
        console.log(genericInput);
        console.log(genericOutput);
        console.log(output);
    }
    if(mapDictionaries) {
        if(genericInput.inputs) {
            genericInput.inputs[input.node.id] = input;
        }
        if(genericOutput.outputs) {
            genericOutput.outputs[output.node.id] = output;
        }
        console.log(
            `${output.node.name} ${
                output.switchIndex === -1 ? "" : `(${output.switchIndex}) `
            }connected to ${input.node.name} ${
                input.switchIndex === -1 ? "" : `(${input.switchIndex})`
            }`
        );
    }
}

const inputPinClicked = (nodeID,element,switchIndex=-1) => {
    processPinClick(nodeID,element,switchIndex,true,
        (inputNode,outputNode,outputSwitchIndex,inputSwitchIndex) => {
        genericConnect({
            node: inputNode,
            switchIndex: inputSwitchIndex
        },{
            node: outputNode,
            switchIndex: outputSwitchIndex
        },true);
    },inputNode=>{
        //use switchIndex

        //todo
        //disconnect all outputs that are going into this input node
    });
}

const outputPinClicked = (nodeID,element,switchIndex=-1) => {
    processPinClick(nodeID,element,switchIndex,false,
        (outputNode,inputNode,inputSwitchIndex,outputSwitchIndex) => {
            genericConnect({
                node: inputNode,
                switchIndex: inputSwitchIndex
            },{
                node: outputNode,
                switchIndex: outputSwitchIndex
            },true);    
        },outputNode=>{
        //use switchIndex

        //todo
        //disconnect all inputs that are going out of this input node
    });
}

const createSwitch = (id,name) => {
    const node = document.createElement("div");
    node.id = `node-${id}`;
    node.className = "node switch";

    const createPin = type => {
        const pin = document.createElement("div");
        pin.className = `${type}-pin`;
        return pin;
    }

    const isInputType = name === "input switch";

    let p1,p2,p3;

    if(isInputType) {
        p1 = createPin("input");
        p2 = createPin("input");
        p3 = createPin("output");
        ((nodeID)=>{
            p1.onclick = event => {
                inputPinClicked(nodeID,event.target,0);
            };
            p2.onclick = event => {
                inputPinClicked(nodeID,event.target,1);
            };
            p3.onclick = event => {
                outputPinClicked(nodeID,event.target,2);
            };
        })(node.id);
    } else {
        p1 = createPin("output");
        p2 = createPin("output");
        p3 = createPin("input");
        ((nodeID)=>{
            p1.onclick = event => {
                outputPinClicked(nodeID,event.target,0);
            };
            p2.onclick = event => {
                outputPinClicked(nodeID,event.target,1);
            };
            p3.onclick = event => {
                inputPinClicked(nodeID,event.target,2);
            };
        })(node.id);
    }

    node.appendChild(p1);
    node.appendChild(p2);
    node.appendChild(p3);

    const p = createNameLabel(node.id,name);
    node.appendChild(p);

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";

    const checkboxInput = document.createElement("input");
    checkboxInput.type = "checkbox";

    ((nodeID,isInputType)=>{
        checkboxInput.onchange = event => {
            setSwitchState(
                nodeID,
                isInputType,
                event.target.checked
            );
        }
    })(node.id,isInputType);

    const spanSlider = document.createElement("span");
    spanSlider.className = "slider";
    
    switchLabel.appendChild(checkboxInput);
    switchLabel.appendChild(spanSlider);

    node.appendChild(switchLabel);

    return node;
}

const createNameLabel = (nodeID,name) => {
    const p = document.createElement("p");
    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    ((nodeID)=>{
        input.oninput = event => {
            nameUpdated(nodeID,event.target.value);
        }
    })(nodeID);
    p.appendChild(input);
    return p;
}

const createFileSourceControl = (id,name) => {

    const node = document.createElement("div");
    node.id = `node-${id}`;

    node.classList = "node source";

    const outputPin = document.createElement("div");
    outputPin.className = "output-pin";

    node.appendChild(outputPin);

    const p = document.createElement("p");
    p.appendChild(
        document.createTextNode(name)
    );

    node.appendChild(p);

    const button1 = document.createElement("button");
    const button2 = document.createElement("button");
    button1.id = `${node.id}-0`;
    button2.id = `${node.id}-1`;

    button1.appendChild(
        document.createTextNode("play")
    );
    
    button2.appendChild(
        document.createTextNode("loop")
    );

    ((nodeID,button1,button2)=>{
        button1.onclick = event => {
            sourceControlButton1(nodeID,button1,button2);
        }
        button2.onclick = event => {
            sourceControlButton2(nodeID,button1,button2);
        }
        outputPin.onclick = event => {
            outputPinClicked(nodeID,event.target);
        }
    })(node.id,button1,button2);

    node.appendChild(button1);
    node.appendChild(button2);

    return node;

}

const createVolumeControl = (id,name) => {
    const node = document.createElement("div");
    node.id = `node-${id}`;

    node.classList = "node dual-pin";
    const p = createNameLabel(node.id,name);
    
    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.min = 0;
    volumeSlider.max = volumeControlFactor;
    volumeSlider.value = volumeControlFactor / 2;

    ((nodeID)=> {
        volumeSlider.oninput = event => {
            updateVoumeNode(
                nodeID,
                event.target.value
            );
        }
    })(node.id);

    volumeSlider.className = "slider";
    
    const inputPin = document.createElement("div");
    const outputPin = document.createElement("div");
    
    inputPin.className = "input-pin";
    outputPin.className = "output-pin";

    ((nodeID)=>{
        inputPin.onclick = event => {
            inputPinClicked(nodeID,event.target);
        }
        outputPin.onclick = event => {
            outputPinClicked(nodeID,event.target);
        }
    })(node.id);

    node.appendChild(inputPin);
    node.appendChild(outputPin);
    
    node.appendChild(p);
    node.appendChild(volumeSlider);

    return node;
}
