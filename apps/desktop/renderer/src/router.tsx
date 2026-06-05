import { createHashRouter, Navigate } from 'react-router';

import { DesktopLayout } from '@renderer/components/layout';
import { RouteErrorBoundary } from '@renderer/components/error-boundary';
import { ApplicationDetailPage } from '@renderer/pages/application-detail';
import { ApplicationsPage } from '@renderer/pages/applications';
import { AutopilotRunDetailPage } from '@renderer/pages/autopilot-run-detail';
import { AutopilotRunsPage } from '@renderer/pages/autopilot-runs';
import { AutopilotPage } from '@renderer/pages/autopilot';
import { OverviewPage } from '@renderer/pages/overview';
import { DiscoveryRunDetailPage } from '@renderer/pages/discovery-run-detail';
import { JobDetailPage } from '@renderer/pages/job-detail';
import { JobsPage } from '@renderer/pages/jobs';
import { RunsPage } from '@renderer/pages/runs';
import { SetupPage } from '@renderer/pages/setup';
import { ShortlistPage } from '@renderer/pages/shortlist';
import { SubmittedPage } from '@renderer/pages/submitted';

export const router = createHashRouter([
  {
    path: '/',
    element: <DesktopLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to="/overview" replace />
      },
      {
        path: 'overview',
        element: <OverviewPage />
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
        path: 'shortlist',
        element: <ShortlistPage />
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
        path: 'submitted',
        element: <SubmittedPage />
      },
      {
        path: 'applications',
        element: <ApplicationsPage />
      },
      {
        path: 'applications/:runId',
        element: <ApplicationDetailPage />
      },
      {
        path: 'setup',
        element: <SetupPage />
      }
    ]
  }
]);
