import { useState } from 'react';
import { DrawingScreen } from './DrawingScreen';
import { createDrawingSession } from './drawing/session';

export function ProbeApp() {
  const [session] = useState(createDrawingSession);
  return <DrawingScreen session={session} />;
}
