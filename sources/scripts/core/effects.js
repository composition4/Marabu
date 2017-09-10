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

// FX

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
  return compressor_average/parseFloat(length)/20;
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
  // TODO: fill in 
}
