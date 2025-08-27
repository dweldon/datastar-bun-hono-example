import { type FC } from 'hono/jsx';

export const SHAPES = ['note', 'heart', 'circle', 'diamond'] as const;

type Shape = (typeof SHAPES)[number];

type ShapeProps = {
  shape?: Shape;
};

const shapeCharacter = new Map<Shape, string>([
  ['note', '♪'],
  ['heart', '♥'],
  ['circle', '○'],
  ['diamond', '◆'],
]);

export const Shape: FC<ShapeProps> = ({ shape }) => {
  if (!shape) return <div id="shape"></div>;

  return (
    <div
      id="shape"
      style={{ color: 'red', fontSize: '32px', marginBottom: '16px' }}
    >
      {shapeCharacter.get(shape)}
    </div>
  );
};
