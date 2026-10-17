import { Typography } from 'antd';
import { resetIndustry, templateOf, DATA_TEMPLATE, useIndustry } from '../data/industry';
import { useApp } from './AppContext';
import '../screens/IndustryPreview.css';

/** Always offers the way back to the template with data while another one is selected (D-09). */
export function IndustryBanner() {
  const ind = useIndustry();
  const app = useApp();
  if (ind.hasData) return null;
  return (
    <div className="industry-banner" role="status">
      <span>
        시연용 업종 설정: <strong>{ind.template.name}</strong> — 이 업종 데이터는 연계 전이라 지표 구성만 바뀌고 값은 "데이터 없음"으로 보입니다.
      </span>
      <Typography.Link onClick={() => resetIndustry(app.user.id)}>{templateOf(DATA_TEMPLATE).name}(으)로 되돌리기</Typography.Link>
    </div>
  );
}
