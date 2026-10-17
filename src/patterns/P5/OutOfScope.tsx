import { Empty } from 'antd';
import { Panel } from '../../components/Panel';

/** Shown instead of a record from a site outside the current selection (same rule as MNT-011, D-62). */
export function OutOfScope({ title, what, siteName }: { title: string; what: string; siteName: string }) {
  return (
    <Panel title={title}>
      <Empty description={`${what}은(는) ${siteName} 소속입니다. 사업장 선택을 바꾸거나 권한을 요청하세요.`} />
    </Panel>
  );
}
