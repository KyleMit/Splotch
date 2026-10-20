// The native app has no session storage or referrer to read: the in-app visit that
// RsdDrawingScreen tracks is the only way it knows the drawing ran (drawingArrival.web.ts).
export function drawingArrival() {
  return { sessionFlag: null, referrer: '', origin: '' };
}
