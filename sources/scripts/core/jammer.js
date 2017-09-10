/* -*- mode: javascript; tab-width: 2; indent-tabs-mode: nil; -*-
*
* Copyright (c) 2011-2013 Marcus Geelnard
*
* This file is part of SoundBox.
*
* SoundBox is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* SoundBox is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with SoundBox.  If not, see <http://www.gnu.org/licenses/>.
*
*/

"use strict";

// OSCs

var oscs = require("./oscs.js");

var osc_sin    = oscs.osc_sin;
var osc_saw    = oscs.osc_saw;
var osc_square = oscs.osc_square;
var osc_tri    = oscs.osc_tri;


// Pinking

var b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;

function effect_pinking(input,val)
{
  b0 = 0.99886 * b0 + input * 0.0555179;
  b1 = 0.99332 * b1 + input * 0.0750759;
  b2 = 0.96900 * b2 + input * 0.1538520;
  b3 = 0.86650 * b3 + input * 0.3104856;
  b4 = 0.55000 * b4 + input * 0.5329522;
  b5 = -0.7616 * b5 - input * 0.0168980;
  var output = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + input * 0.5362) * 0.1;
  b6 = input * 0.115926;

  return (output * val) + (input * (1 - val));
}

// Compressor

function effect_compressor(input,average,val)
{
  var output = input;
  if(input < average){
    output *= 1 + val;
  }
  else if(input > average){
    output *= 1 - val;
  }
  return output;
}

function make_compressor_average(length,samples)
{
  var compressor_average = 0;
  for (var j = 0; j < length; j++) {
    compressor_average += samples[j];
  }
  return compressor_average/parseFloat(length);
}

// Distortion

function effect_distortion(input,val)
{
  if(!val){ return input; }

  var output = input;
  output *= val;
  output = output < 1 ? output > -1 ? osc_sin(output*.25) : -1 : 1;
  output /= val;
  return output;
}

// Drive

function effect_drive(input,val)
{
  var output = input;
  return output * val;
}

// Reverb

function effect_reverb(input,val)
{
  if (!val) { return input; } // pass-thru if no val

  var delay = val;
  var delaySamples = Number(delay / 1000.0 * sampleRate);
  var decay = 0.5;
  for (var i = 0; i < input.length - delaySamples; i++)
  {
    // TODO: overflow check
    input[i + delaySamples] += input[i] * decay;
  }
}

/*
 * 
 */
function util_fft(unzip, zip)
{
}


var CJammer = function () {

  //--------------------------------------------------------------------------
  // Private members
  //--------------------------------------------------------------------------

  // Currently playing notes.
  var MAX_POLYPHONY = 16;
  var mPlayingNotes = [];

  // Current instrument.
  var mInstr;

  // Current row length (i.e. BPM).
  var mRowLen;

  // Effect state.
  var mFXState;

  // Delay buffers.
  var MAX_DELAY = 131072;   // Must be a power of 2.
  var mDlyLeft, mDlyRight;

  // Web Audio context.
  var mAudioContext;
  var mScriptNode;
  var mSampleRate;
  var mRateScale;


  //--------------------------------------------------------------------------
  // Sound synthesis engine.
  //--------------------------------------------------------------------------

  var getnotefreq = function (n)
  {
    return (174.614115728 / mSampleRate) * Math.pow(2, (n-128)/12);
  };

  // Array of oscillator functions.
  var mOscillators = [
    osc_sin,
    osc_square,
    osc_saw,
    osc_tri
  ];

  // Fill the buffer with more audio, and advance state accordingly.
  var generateTimeSlice = function (leftBuf, rightBuf) {
    var numSamples = rightBuf.length;

    // Local variables
    var i, j, k, b, p, row, col, n, cp,
        t, lfor, e, x, rsample, rowStartSample, f, da;

    // Clear buffers
    for (k = 0; k < numSamples; ++k) {
      leftBuf[k] = 0;
      rightBuf[k] = 0;
    }

    // Generate active notes.
    for (i = 0; i < MAX_POLYPHONY; ++i) {
      var note = mPlayingNotes[i];
      if (note != undefined) {
        var osc1 = mOscillators[note.instr[0]],
            o1vol = note.instr[1],
            o1xenv = note.instr[3],
            osc2 = mOscillators[note.instr[4]],
            o2vol = note.instr[5],
            o2xenv = note.instr[8],
            noiseVol = note.instr[13],
            attack = Math.round(note.instr[10] * note.instr[10] * 4 * mRateScale),
            sustain = Math.round(note.instr[11] * note.instr[11] * 4 * mRateScale),
            release = Math.round(note.instr[12] * note.instr[12] * 4 * mRateScale),
            releaseInv = 1 / release,
            arpInterval = mRowLen * Math.pow(2, 2 - 0);

        // Note frequencies (defined later) and arpeggio
        var o1f, o2f;
        var arp = note.arp, arpSamples = note.arpSamples;

        // Current oscillator state.
        var o1t = note.o1t, o2t = note.o2t;

        // Generate note.
        var samplesLeft = attack + sustain + release - note.env;
        if (samplesLeft <= numSamples) {
          // End of note.
          mPlayingNotes[i] = undefined;
        } else {
          samplesLeft = numSamples;
        }
        for (j = note.env, k = 0; k < samplesLeft; j++, k++) {
          if (arpSamples >= 0 || k == 0) {
            if (arpSamples >= 0) {
              // Switch arpeggio note
              arp = (arp >> 8) | ((arp & 255) << 4);
              arpSamples -= arpInterval;
            }

            // Calculate note frequencies for the oscillators
            o1f = getnotefreq(note.n + (arp & 15) + note.instr[2] - 128);
            o2f = getnotefreq(note.n + (arp & 15) + note.instr[6] - 128) * (1 + 0.0008 * note.instr[7]);
          }
          arpSamples++;

          // Envelope
          e = 1;
          if (j < attack) {
            e = j / attack;
          } else if (j >= attack + sustain) {
            e -= (j - attack - sustain) * releaseInv;
          }

          // Oscillator 1
          t = o1f;
          if (o1xenv) {
            t *= e * e;
          }
          o1t += t;
          rsample = osc1(o1t) * o1vol;

          // Oscillator 2
          t = o2f;
          if (o2xenv) {
              t *= e * e;
          }
          o2t += t;
          rsample += osc2(o2t) * o2vol;

          // Noise oscillator
          if (noiseVol) {
            rsample += (2 * Math.random() - 1) * noiseVol;
          }

          // Add to (mono) channel buffer
          rightBuf[k] += 0.002441481 * rsample * e;
        }

        // Save state.
        note.env = j;
        note.arp = arp;
        note.arpSamples = arpSamples;
        note.o1t = o1t;
        note.o2t = o2t;
      }
    }

    // And the effects...

    var pos = mFXState.pos,
        low = mFXState.low,
        band = mFXState.band,
        filterActive = mFXState.filterActive,
        dlyPos = mFXState.dlyPos;

    var lsample, high, dlyRead, dlyMask = MAX_DELAY - 1;

    // Put performance critical instrument properties in local variables
    var oscLFO = mOscillators[mInstr[15]],
        lfoAmt = mInstr[16] / 512,
        lfoFreq = Math.pow(2, mInstr[17] - 9) / mRowLen,
        fxLFO = mInstr[18],
        fxFilter = mInstr[19],
        fxFreq = mInstr[20] * 43.23529 * 3.141592 / mSampleRate,
        q = 1 - mInstr[21] / 255,
        distortion_val = mInstr[22] * 1e-5 * 32767,
        drive_val = mInstr[23] / 32,
        panAmt = mInstr[24] / 512,
        panFreq = 6.283184 * Math.pow(2, mInstr[25] - 9) / mRowLen,
        dlyAmt = mInstr[26] / 255,
        dly = (mInstr[27] * mRowLen) >> 1,
        bit_phaser_val = 0.5 - (0.49 * (mInstr[9]/255.0)),
        bit_step_val = 16 - (14 * (mInstr[9]/255.0)),
        compressor_val = mInstr[14],
        pinking_val = mInstr[28];

    // Limit the delay to the delay buffer size.
    if (dly >= MAX_DELAY) {
      dly = MAX_DELAY - 1;
    }

    // Compressor
    var compressor_average = make_compressor_average(numSamples,rightBuf);

    // Perform effects for this time slice
    for (j = 0; j < numSamples; j++) {
      k = (pos + j) * 2;

      // Dry mono-sample.
      rsample = rightBuf[j];

      // We only do effects if we have some sound input.
      if (rsample || filterActive) {

        // Bit.
        mFXState.bit_phaser += bit_phaser_val; // Between 0.1 and 1
        var step = Math.pow(1/2, bit_step_val); // between 1 and 16

        if (mFXState.bit_phaser >= 1.0) {
          mFXState.bit_phaser -= 1.0;
          mFXState.bit_last = step * Math.floor(rsample / step + 0.5);
        }

        rsample = bit_step_val < 16 ? mFXState.bit_last : rsample;

        // State variable filter.
        f = fxFreq;
        if (fxLFO) {
          f *= oscLFO(lfoFreq * k) * lfoAmt + 0.5;
        }
        f = 1.5 * Math.sin(f);
        low += f * band;
        high = q * (rsample - band) - low;
        band += f * high;
        rsample = fxFilter == 3 ? band : fxFilter == 1 ? high : low;

        rsample = effect_distortion(rsample,distortion_val);
        rsample = effect_pinking(rsample,pinking_val/255);
        rsample = effect_compressor(rsample,compressor_average,compressor_val/255);
        rsample = effect_drive(rsample,drive_val);

        // Is the filter active (i.e. still audiable)?
        filterActive = rsample * rsample > 1e-5;

        // Panning.
        t = Math.sin(panFreq * k) * panAmt + 0.5;
        lsample = rsample * (1 - t);
        rsample *= t;
      } else {
        lsample = 0;
      }

      // Delay is always done, since it does not need sound input.
      dlyRead = (dlyPos - dly) & dlyMask;
      lsample += mDlyRight[dlyRead] * dlyAmt;
      rsample += mDlyLeft[dlyRead] * dlyAmt;
      mDlyLeft[dlyPos] = lsample;
      mDlyRight[dlyPos] = rsample;
      dlyPos = (dlyPos + 1) & dlyMask;

      // Store wet stereo sample.
      leftBuf[j] = lsample;
      rightBuf[j] = rsample;
    }

    // Update effect sample position.
    pos += numSamples;

    // Prevent rounding problems...
    while (pos > mRowLen * 2048) {
      pos -= mRowLen * 2048;
    }

    // Store filter state.
    mFXState.pos = pos;
    mFXState.low = low;
    mFXState.band = band;
    mFXState.filterActive = filterActive;
    mFXState.dlyPos = dlyPos;
  };

  //--------------------------------------------------------------------------
  // Public interface.
  //--------------------------------------------------------------------------

  this.start = function ()
  {
    // Create an audio context.
    if (window.AudioContext) {
      mAudioContext = new AudioContext();
    } else if (window.webkitAudioContext) {
      mAudioContext = new webkitAudioContext();
      // mAudioContext.createScriptProcessor = mAudioContext.createJavaScriptNode;
    } else {
      mAudioContext = undefined;
      return;
    }

    // Get actual sample rate (SoundBox is hard-coded to 44100 samples/s).
    mSampleRate = mAudioContext.sampleRate;
    mRateScale = mSampleRate / 44100;

    // Clear state.
    mFXState = {
      pos: 0,
      low: 0,
      band: 0,
      filterActive: false,
      dlyPos: 0,
      bit_last: 0,
      bit_phaser: 0
    };

    // Create delay buffers (lengths must be equal and a power of 2).
    mDlyLeft = new Float32Array(MAX_DELAY);
    mDlyRight = new Float32Array(MAX_DELAY);

    // Create a script processor node with no inputs and one stereo output.
    mScriptNode = mAudioContext.createScriptProcessor(2048, 0, 2);

    mScriptNode.onaudioprocess = function (event) {
      var leftBuf = event.outputBuffer.getChannelData(0);
      var rightBuf = event.outputBuffer.getChannelData(1);
      generateTimeSlice(leftBuf, rightBuf);
    };

    mScriptNode.connect(mAudioContext.destination);    
  };

  this.stop = function () {
    // TODO(m): Implement me!
  };

  this.updateInstr = function (instr)
  {
    mInstr = [];
    for (var i = 0; i < instr.length; ++i) {
      mInstr.push(instr[i]);
    }
  };

  this.updateRowLen = function (rowLen) {
    mRowLen = Math.round(rowLen * mRateScale);
  };

  this.addNote = function (n) {
    var t = (new Date()).getTime();

    // Create a new note object.
    var note = {
      startT: t,
      env: 0,
      arp: 0,
      arpSamples: 0,
      o1t: 0,
      o2t: 0,
      n: n,
      instr: new Array(15)
    };

    // Copy (snapshot) the oscillator/env/arp part of the current instrument.
    for (var i = 0; i < 15; ++i) {
      note.instr[i] = mInstr[i];
    }

    // Find an empty channel, or replace the oldest note.
    var oldestIdx = 0;
    var oldestDt = -100;
    for (var i = 0; i < MAX_POLYPHONY; ++i) {
      // If the channel is currently free - use it.
      if (mPlayingNotes[i] == undefined) {
        mPlayingNotes[i] = note;
        return;
      }

      // Check if this channel has the oldest playing note.
      var dt = t - mPlayingNotes[i].startT;
      if (dt > oldestDt) {
        oldestIdx = i;
        oldestDt = dt;
      }
    }

    // All channels are playing - replace the oldest one.
    mPlayingNotes[oldestIdx] = note;
  };

};
