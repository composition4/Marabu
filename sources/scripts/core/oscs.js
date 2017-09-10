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

var osc_sin = function (value)
{
  return Math.sin(value * 6.283184);
};

var osc_saw = function (value)
{
  return 2 * (value % 1) - 1;
};

var osc_square = function (value)
{
  return (value % 1) < 0.5 ? 1 : -1;
};

var osc_tri = function (value)
{
  var v2 = (value % 1) * 4;
  if(v2 < 2) return v2 - 1;
  return 3 - v2;
};
