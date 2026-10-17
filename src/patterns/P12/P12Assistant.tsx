// P12 대화형 (AIX-010): the assistant conversation as the whole body; same turns as the drawer.
import { AssistantPanel } from '../../shell/AssistantPanel';
import { ScreenLayout } from '../../shell/ScreenLayout';
import type { TemplateProps } from '../../shell/ScreenHost';

export function P12Assistant({ entry, def, badges }: TemplateProps) {
  const extra = (def as unknown as { badges?: string[] }).badges ?? [];
  return (
    <ScreenLayout entry={entry} badges={[...badges, ...extra]} bodyMode="fit">
      <AssistantPanel full />
    </ScreenLayout>
  );
}
