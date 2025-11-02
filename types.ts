export enum WaveformStyle {
  Line = 'Line',
  GradientLine = 'Gradient Line',
  ReflectedLine = 'Reflected Line',
  Equalizer = 'Equalizer',
  SymmetricBars = 'Symmetric Bars',
  BottomBars = 'Bottom Bars',
  Circle = 'Circle',
  Pulse = 'Pulse',
}

export interface ColorPreset {
  name: string;
  colors: string[];
}
