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
connectorToolButton.disabled = false;

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
        case "input-switch":
            dictionaryEntry.type = "input-switch";
            dictionaryEntry.leftInputs = {};
            dictionaryEntry.rightInputs = {};
            dictionaryEntry.outputs = {};

            dictionaryEntry.leftInputNode = audioContext.createGain();
            dictionaryEntry.rightInputNode = audioContext.createGain();
            dictionaryEntry.outputNode = audioContext.createGain();

            dictionaryEntry.isLeft = true;
            dictionaryEntry.leftInputNode.connect(dictionaryEntry.outputNode);

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
    for(let [key,value] of Object.entries(node.outputs)) {
        genericConnect({ //Ignore the names of this function, just use the schematic below.
                //Output node: This is where sound comes from
                node: node,
                switchIndex: -1
            },{
                //Input node: This is where we are sending sound to
                node: value.node,
                switchIndex: value.switchIndex
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
            node.source.start(audioContext.currentTime,node.pausedTime);
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

const setSwitchState = (nodeID,condition) => {

    const node = nodeDictionary[nodeID];

    if(condition) {
        //Change from left input to right input.
        node.leftInputNode.disconnect(node.outputNode);
        node.rightInputNode.connect(node.outputNode);
    } else {
        //Change from right input to left input.
        node.rightInputNode.disconnect(node.outputNode);
        node.leftInputNode.connect(node.outputNode);
    }

    node.isLeft = !condition;
}
const updateVoumeNode = (nodeID,value) => {
    nodeDictionary[nodeID].gainNode.gain.setValueAtTime(value / volumeControlFactor, audioContext.currentTime);
}

const getPinEnumeration = (pinIndex) => {
    //Todo: Make a proper pin enumerator
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    return alphabet[pinIndex % alphabet.length];
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
        case "input-switch":
            //Tracking schema: leftInputs, rightInputs, outputs
            //Input node: outputNode
            //Output nodes: leftInputNode, rightInputNode

            outputs = abstractNode.node.outputs;
            outputAudioNode = abstractNode.node.outputNode;

            if(abstractNode.switchIndex === 0) {
                inputs = abstractNode.node.leftInputs;
                inputAudioNode = abstractNode.node.leftInputNode;

            } else if(abstractNode.switchIndex === 1) {
                inputs = abstractNode.node.rightInputs;
                inputAudioNode = abstractNode.node.rightInputNode;
                
            } else {
                if(abstractNode.node.isLeft) {
                    inputs = abstractNode.node.leftInputs;
                    inputAudioNode = abstractNode.node.leftInputNode;
                } else {
                    inputs = abstractNode.node.rightInputs;
                    inputAudioNode = abstractNode.node.rightInputNode;
                }
                console.warn("Possible problem: Confusing switch index on output switch");
            }
            break;
        case "volume-control":
            //Tracking schema: outputs, inputs
            //Input node: gainNode
            //Output node: gainNode

            inputAudioNode = abstractNode.node.gainNode;
            outputAudioNode = abstractNode.node.gainNode;

            outputs = abstractNode.node.outputs;
            inputs = abstractNode.node.inputs;
            break;
        case "file-source-control":
            //Tracking schema: outputs
            //Output node: source

            outputs = abstractNode.node.outputs;
            outputAudioNode = abstractNode.node.source;
            break;
        case "master":
            //Tracking schema: inputs
            //Input node: audioContext.destination

            inputAudioNode = audioContext.destination;
            inputs = abstractNode.node.inputs;
            break;
    }
    return {
        inputAudioNode: inputAudioNode,
        outputAudioNode: outputAudioNode,
        inputs: inputs,
        outputs: outputs
    }

}

const genericConnect = (input,output,mapDictionaries=true) => {

    //This method is very confused on the boolean difference between input and output.
    //This current configuration is very messy but it works and all callees expect that it accepts "input" followed by "output".

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
            `'${output.node.name}' connected to '${input.node.name}'`
        );
    }
}

const inputPinClicked = (nodeID,element,switchIndex=-1) => {
    processPinClick(nodeID,element,switchIndex,true,
        (inputNode,outputNode,inputSwitchIndex,outputSwitchIndex) => {
        genericConnect({
            node: inputNode,
            switchIndex: inputSwitchIndex
        },{
            node: outputNode,
            switchIndex: outputSwitchIndex
        },true);
    },inputNode=>{
        //Todo: Disconnect all outputs that are going into this input node, clear the outputs list, and delete associated DOM
    });
}

const outputPinClicked = (nodeID,element,switchIndex=-1) => {
    processPinClick(nodeID,element,switchIndex,false,
    (outputNode,inputNode,outputSwitchIndex,inputSwitchIndex) => {
        genericConnect({
            node: inputNode,
            switchIndex: inputSwitchIndex
        },{
            node: outputNode,
            switchIndex: outputSwitchIndex
        },true);    
    },outputNode=>{
        //Todo: Disconnect all inputs that are going out of this output node, clear the inputs list, and delete associated DOM
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

    let p1 = createPin("input");
    let p2 = createPin("input");
    let p3 = createPin("output");
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

    node.appendChild(p1);
    node.appendChild(p2);
    node.appendChild(p3);

    const p = createNameLabel(node.id,name);
    node.appendChild(p);

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";

    const checkboxInput = document.createElement("input");
    checkboxInput.type = "checkbox";

    (nodeID=>{
        checkboxInput.onchange = event => {
            setSwitchState(
                nodeID,
                event.target.checked
            );
        }
    })(node.id);

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
