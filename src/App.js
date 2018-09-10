import React, { Component } from 'react';
import NoSleep from './nosleep/index.js';
import './App.css';
import MidiUtil from "./midi-util.js";

class Splash extends React.Component {
    render() {
        return (
            <div className="splash" onClick={this.props.onClick}>
                <div className='splash-text'>Start</div>
            </div>
        );
    }
}

const Button = (props) => {
    // place within <tr>
    return (
        <td onClick={props.onClick} className={props.enabled ? "enabled" : ""}>
            {props.text}
        </td>
    );
}

class OutputButtons extends React.Component {
    // place within <tbody>, contains its own <tr>
    render() {
        return (
            <tr>
                <Button text="INTERNAL" enabled={this.props.outputEnabled == "INTERN"}
                    onClick={() => this.props.changeOutput("INTERN")}/>
                <Button text="CHANNEL 1" enabled={this.props.outputEnabled == "EXTERN1"}
                    onClick={() => this.props.changeOutput("EXTERN1")}/>
                <Button text="CHANNEL 2" enabled={this.props.outputEnabled == "EXTERN2"}
                    onClick={() => this.props.changeOutput("EXTERN2")}/>
                <Button text="CHANNEL 10" enabled={this.props.outputEnabled == "EXTERN10"}
                    onClick={() => this.props.changeOutput("EXTERN10")}/>
            </tr>
        );
    }
}


class App extends Component {
    state = {
        running: false, // becomes true once the start button is pressed
        outputEnabled: "INTERN", // INTERN, EXTERN1, EXTERN2, EXTERN10
    };

    onStartPressed = () => {
        this.setState({running: true});

        new NoSleep().enable();
        this.midiUtil = new MidiUtil(this);
    };

    changeOutput = (output) => {
        this.setState({outputEnabled: output});
        this.midiUtil.releaseNotes();
    }

    render() {
        if (this.state.running) {
            return (
                <table><tbody>
                    <OutputButtons outputEnabled={this.state.outputEnabled} changeOutput={this.changeOutput} />
                    <tr>
                        <Button text="RECONNECT" onClick={() => this.midiUtil.connect()}/>
                    </tr>
                </tbody></table>
            );
        } else {
            return (
                <Splash onClick={this.onStartPressed}/>
            );
        }
    }
}

export default App;
