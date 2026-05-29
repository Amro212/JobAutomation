import { createHashRouter, Navigate } from 'react-router';

import { DesktopLayout } from '@renderer/components/layout';
import { ApplicationDetailPage } from '@renderer/pages/application-detail';
import { ApplicationsPage } from '@renderer/pages/applications';
import { AutopilotRunDetailPage } from '@renderer/pages/autopilot-run-detail';
import { AutopilotRunsPage } from '@renderer/pages/autopilot-runs';
import { AutopilotPage } from '@renderer/pages/autopilot';
import { DiscoveryRunDetailPage } from '@renderer/pages/discovery-run-detail';
import { JobDetailPage } from '@renderer/pages/job-detail';
import { JobsPage } from '@renderer/pages/jobs';
import { RunsPage } from '@renderer/pages/runs';

export const router = createHashRouter([
  {
    path: '/',
    element: <DesktopLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/autopilot" replace />
      },
      {
        path: 'autopilot',
        element: <AutopilotPage />
      },
      {
        path: 'autopilot-runs',
        element: <AutopilotRunsPage />
      },
      {
        path: 'autopilot-runs/:runId',
        element: <AutopilotRunDetailPage />
      },
      {
        path: 'jobs',
        element: <JobsPage />
      },
      {
        path: 'jobs/:jobId',
        element: <JobDetailPage />
      },
      {
        path: 'runs',
        element: <RunsPage />
      },
      {
        path: 'runs/:runId',
        element: <DiscoveryRunDetailPage />
      },
      {
        path: 'applications',
        element: <ApplicationsPage />
      },
      {
        path: 'applications/:runId',
        element: <ApplicationDetailPage />
      }
    ]
  }
]);
