// P6 has two forms: fields in sections (P6Form) and the step-by-step setup (P6Steps, D-01).
import type { TemplateProps } from '../../shell/ScreenHost';
import { P6Form } from './P6Form';
import { P6Steps, type StepDef } from './P6Steps';

export function P6Template(props: TemplateProps) {
  const steps = (props.def as unknown as { steps?: StepDef[] }).steps;
  if (steps?.length) return <P6Steps {...props} def={props.def as unknown as Parameters<typeof P6Steps>[0]['def']} />;
  return <P6Form {...props} />;
}
