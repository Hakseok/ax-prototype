// P13 공정도형: the viewer (OPS-060) or the designer (SET-080), chosen by the definition's hmi.mode.
import type { TemplateProps } from '../../shell/ScreenHost';
import { P13Designer } from './P13Designer';
import { P13Viewer, type P13Definition } from './P13Viewer';

export function P13Process(props: TemplateProps) {
  const def = props.def as unknown as P13Definition;
  return def.hmi.mode === 'designer' ? <P13Designer {...props} /> : <P13Viewer {...props} />;
}
