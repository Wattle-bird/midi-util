class MidiUtil {
    constructor(app) {
        this.app = app;

        this.keyboards = new MidiDeviceGroup();
        this.circuit = new MidiDeviceGroup();
        this.portamentoDisabled = false; // reface CS portamento blocker
        this.keysDown = [];

        navigator.requestMIDIAccess({sysex: true}).then(midiAccess => {
            this.midi = midiAccess;
            this.connect();
        });
    }

    get outputMode() {
        return this.app.state.outputEnabled;
    }

    connect() {
        this.clearDevices();

        this.populateDevices();

        // bind input callbacks
        this.keyboards.setCallback(this.keyboardCallback);
        this.circuit.setCallback(this.circuitCallback);

        this.sendDeviceInit();

        // TODO leave this here until there's a connected device UI
        for (let k of this.keyboards.froms) {
            console.log(k.name);
        }
        for (let k of this.circuit.froms) {
            console.log(k.name);
        }
    }

    populateDevices() {
        // obtain outputs
        var outputs = this.midi.outputs.values();
        for (var output = outputs.next(); output && !output.done; output = outputs.next()) {
            if (output.value.name.includes('Midi Through Port')) continue;
            if (output.value.name.includes('Circuit')) {
                this.circuit.tos.push(output.value);
            } else {
                this.keyboards.tos.push(output.value);
            }
        }

        // obtain inputs
        var inputs = this.midi.inputs.values();
        for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
            if (input.value.name.includes('Midi Through Port')) continue;
            if (input.value.name.includes('Circuit')) {
                this.circuit.froms.push(input.value);
            } else {
                this.keyboards.froms.push(input.value);
            }
        }
    }

    clearDevices() {
        this.circuit.clear();
        this.keyboards.clear();
    }

    sendDeviceInit() {
        // Sends device specific CC and SYSEX messages

        // Disable reface local control
        this.keyboards.send([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x03, 0x00, 0x00, 0x06, 0x00, 0xf7]);
        // enable reface slider CCs
        this.keyboards.send([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x03, 0x00, 0x00, 0x0e, 0x01, 0xf7]);
        // load YS200 state
        this.keyboards.send([240,67,1,126,0,110,76,77,32,32,56,48,51,54,83,32,64,16,1,1,4,2,18,0,0,126,0,24,99,3,3,0,4,0,99,0,127,127,0,24,99,3,0,0,0,2,0,16,0,127,0,48,0,3,3,0,0,0,99,0,127,0,0,48,24,3,0,0,0,2,99,4,127,32,14,0,99,3,3,0,0,2,99,0,127,3,0,48,80,3,0,0,0,2,99,0,127,0,14,0,99,0,0,0,0,2,0,16,0,127,0,48,32,3,0,0,1,247]);
    }

    keyboardCallback(msg) {
        // ignore system messages
        if ((msg.data[0] & 0xf0) == 0xf0) {
            return;
        }

        // enable portamento blocking when reface CS sets portamento to 1
        if ((msg.data[0] & 0xf0) == 0xb0 &&  // msg is a control change and
                msg.data[1] == 0x14          // msg is a portamento CC
                ){
            if (msg.data[2] == 1) { // msg is setting portamento to 1
                this.portamentoDisabled = true;
            } else {
                this.portamentoDisabled = false;
            }
        }

        this.trackKeys(msg);

        // send msg to its destination output
        if (this.portamentoDisabled && this.outputMode == 'INTERN') {
            this.portamentoBlock(msg);
        } else {
            this.sendMsg(msg);
        }
    }

    circuitCallback(msg) {
        if (msg.data[0] == 0xf8) { // timing clock
            this.keyboards.send(msg.data);
        }
    }

    sendMsg(msg) {
        // send a midi message to the appropriate output
        var output, channel;

        if (this.outputMode == 'INTERN') {
            output = this.keyboards;
            channel = 0x00; // channel 1
        } else if (this.outputMode == 'EXTERN1') {
            output = this.circuit;
            channel = 0x00; // channel 1
        } else if (this.outputMode == 'EXTERN2') {
            output = this.circuit;
            channel = 0x01; // channel 2
        } else if (this.outputMode == 'EXTERN10') {
            output = this.circuit;
            channel = 0x09; // channel 10
        } else {
            return;
        }

        // always send control changes to the keyboards
        if ((msg.data[0] & 0xf0) == 0xb0) {
            output = this.keyboards;
            channel = 0x00; // channel 1
        }

        // set channel
        msg.data[0] &= 0xf0;
        msg.data[0] |= channel;

        if (this.outputMode == 'EXTERN10' && (msg.data[0] & 0b11100000) == 0b10000000) {
            // modulo the drum notes, so that they work on any octave
            msg.data[1] %= 12;
            msg.data[1] += 60;
        }

        output.send(msg.data);
    }

    trackKeys(msg) {
        if (isKeyDown(msg)) {
            let key = msg.data[1];
            if (!this.keysDown.includes(key)) {
                this.keysDown.push(key);
            }
        } else if (isKeyUp(msg)) {
            let key = msg.data[1];
            if (this.keysDown.includes(key)) {
                this.keysDown.splice(this.keysDown.indexOf(key), 1);
            }
        }
    }

    portamentoBlock(msg) {
        if (isKeyDown(msg)) {
            if (this.keysDown.length > 1) {
                // a midi message with a copy of the source message data
                var releaseMessage = {data: msg.data.slice()};
                // release the last note
                releaseMessage.data[1] = this.keysDown[this.keysDown.length-2];
                // set velocity to 0
                releaseMessage.data[2] = 0;

                this.sendMsg(releaseMessage);
            }
            this.sendMsg(msg);
        } else if (isKeyUp(msg)) {
            if (this.keysDown.length > 0) {
                // a midi message with a copy of the source message data
                var playMessage = {data: msg.data.slice()};
                // ensure it's a note on, not note off
                playMessage.data[0] |= 0b00010000;
                // play the last note
                playMessage.data[1] = this.keysDown[this.keysDown.length-1];
                // set velocity to 100
                // TODO: use the velocity of the note when it was first played
                // I mostly use synths without velocity, so it doesn't bother me
                playMessage.data[2] = 100;

                this.sendMsg(msg);
                this.sendMsg(playMessage);
            } else {
                this.sendMsg(msg);
            }
        } else {
            this.sendMsg(msg);
        }
    }

    releaseNotes() {
        this.keyboards.send([0xb0, 0x7b, 0x00]);
        this.circuit.send([0xb0, 0x7b, 0x00]); // Channel 1
        this.circuit.send([0xb1, 0x7b, 0x00]); // Channel 2
        this.circuit.send([0xb9, 0x7b, 0x00]); // Channel 10
    }
}


class MidiDeviceGroup {
    froms = [];
    tos = [];

    send(data) {
        for (var to of this.tos) {
            to.send(data);
        }
    }

    clear() {
        // removes devices
        this.setCallback(undefined);
        this.tos = [];
        this.froms = [];
    }

    setCallback(callback) {
        // sets callback for incoming MIDI messages
        for (var from of this.froms) {
            from.onmidimessage = callback;
        }
    }
};

function isKeyDown(msg) {
    if ((msg.data[0] & 0xf0) == 0x90 && // is note on message and...
            msg.data[2] !== 0) { // ... doesn't have velocity 0
        return true;
    }
    return false;
}

function isKeyUp(msg) {
    if ((msg.data[0] & 0xf0) == 0x80 || // is note off message, or
            ((msg.data[0] & 0xf0) == 0x90 && // is note on message and...
            msg.data[2] === 0) // ... has velocity 0
            ) {
        return true;
    }
    return false;
}

export default MidiUtil;
