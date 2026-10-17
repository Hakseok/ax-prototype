// Pattern templates by pattern id. A screen renders through its template when
// config/screens/<id>.json exists; otherwise the shell shows PatternSkeleton.
import type { ComponentType } from 'react';
import type { TemplateProps } from '../shell/ScreenHost';
import { P1Dashboard } from './P1/P1Dashboard';
import { P2Layout } from './P2/P2Layout';
import { P3Analysis } from './P3/P3Analysis';
import { P4Query } from './P4/P4Query';
import { P5Workflow } from './P5/P5Workflow';
import { P6Template } from './P6/P6Template';
import { P7Detail } from './P7/P7Detail';
import { P8MasterDetail } from './P8/P8MasterDetail';
import { P9Evidence } from './P9/P9Evidence';
import { P10Report } from './P10/P10Report';
import { P11Cause } from './P11/P11Cause';
import { P12Assistant } from './P12/P12Assistant';

export const patternTemplates: Partial<Record<string, ComponentType<TemplateProps>>> = {
  P1: P1Dashboard,
  P2: P2Layout,
  P3: P3Analysis,
  P4: P4Query,
  P5: P5Workflow,
  P6: P6Template,
  P7: P7Detail,
  P8: P8MasterDetail,
  P9: P9Evidence,
  P10: P10Report,
  P11: P11Cause,
  P12: P12Assistant
};
