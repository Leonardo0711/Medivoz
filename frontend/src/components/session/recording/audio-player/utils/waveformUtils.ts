
/**
 * Generates random waveform data for visualization
 * @param size Number of data points to generate
 * @returns Array of waveform amplitude values
 */
export function generateWaveformData(size: number = 40): number[] {
  const waveformData: number[] = [];
  
  // Generate a semi-realistic looking waveform with some randomness
  for (let i = 0; i < size; i++) {
    // Base amplitude that varies between 30-70
    const baseAmplitude = 30 + Math.random() * 40;
    
    // Add some patterns to make it look more realistic
    const patternValue = Math.sin(i * 0.5) * 15 + Math.cos(i * 0.2) * 10;
    
    // Combine base amplitude with pattern and add small random variation
    const amplitude = baseAmplitude + patternValue + (Math.random() * 10 - 5);
    
    // Ensure amplitude is positive and reasonable
    waveformData.push(Math.max(5, Math.min(100, amplitude)));
  }
  
  return waveformData;
}
