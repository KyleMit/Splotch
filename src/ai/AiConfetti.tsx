import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import { CONFETTI_PIECES } from '../lib/ai/confettiField';

const MS_PER_SECOND = 1000;
// Pieces start and finish just outside the stage so none pops in or out at an edge.
const OFFSTAGE_PX = 40;
// Each fall eases through three waypoints, as fractions of the stage height.
const FALL_WAYPOINTS = [0.204, 0.481, 0.759];
const FALL_STOPS = [0, 0.25, 0.5, 0.75, 1];
const SPIN_DEG = ['0deg', '55deg', '-40deg', '65deg', '-20deg'];
const FADE_STOPS = [0, 0.08, 0.9, 1];
const FADE_VALUES = [0, 1, 1, 0];
const SQUARE_RADIUS_PX = 2;

function Piece({ piece, height }: { piece: (typeof CONFETTI_PIECES)[number]; height: number }) {
  const clock = useMemo(() => new Animated.Value(0), []);
  const durationMs = piece.duration * MS_PER_SECOND;
  const style = useMemo(() => {
    // A negative delay starts the piece part-way down, the way the web's does.
    const phase = (-piece.delay % piece.duration) / piece.duration;
    const fall = Animated.modulo(Animated.add(clock, phase), 1);
    return {
      opacity: fall.interpolate({ inputRange: FADE_STOPS, outputRange: FADE_VALUES }),
      transform: [
        {
          translateY: fall.interpolate({
            inputRange: FALL_STOPS,
            outputRange: [
              -OFFSTAGE_PX,
              ...FALL_WAYPOINTS.map((fraction) => height * fraction),
              height + OFFSTAGE_PX,
            ],
          }),
        },
        {
          translateX: fall.interpolate({
            inputRange: FALL_STOPS,
            outputRange: [0, piece.sway, -piece.sway, piece.sway, 0],
          }),
        },
        { rotate: fall.interpolate({ inputRange: FALL_STOPS, outputRange: SPIN_DEG }) },
      ],
    };
  }, [clock, height, piece]);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [clock, durationMs]);
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: `${piece.left}%`,
          width: piece.size,
          height: piece.size,
          borderRadius: piece.round ? piece.size / 2 : SQUARE_RADIUS_PX,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

// Falls behind the dial for as long as the picture is on its way.
export function AiConfetti({ height }: { height: number }) {
  return (
    <View pointerEvents="none" style={styles.layer} testID="ai-confetti">
      {CONFETTI_PIECES.map((piece, index) => (
        <Piece key={index} piece={piece} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  piece: { position: 'absolute', top: 0 },
});
