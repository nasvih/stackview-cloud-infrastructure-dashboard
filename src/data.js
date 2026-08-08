/* ============================================================
   stackview — seeded demo estate.
   Everything below is invented sample data for a fictional group of
   companies. Numbers are produced from a fixed seed so they stay the
   same between reloads; the store persists edits to localStorage.
   ============================================================ */

import { seeded, createStore } from '../lib/ui.js';

export const STORE_KEY = 'stackview.state.v1';

export const ORG = {
  name: 'Northline Group',
  units: ['Northline Traders', 'Kerala Coast Foods', 'Jeddah Facilities Co'],
  currency: '$',
  sarRate: 3.75,
};

export const ENVS = ['prod', 'staging', 'dev', 'shared'];
export const PROVIDERS = { aws: 'AWS', azure: 'Azure', onprem: 'On-prem' };

/* service grouping used by the cost views */
export const SERVICE_OF = {
  EC2: 'Compute', VM: 'Compute', Lambda: 'Compute', 'ESXi host': 'On-prem & DC',
  EKS: 'Kubernetes', AKS: 'Kubernetes',
  RDS: 'Databases', 'Azure SQL': 'Databases', ElastiCache: 'Databases',
  S3: 'Storage', 'Storage account': 'Storage', EBS: 'Storage', Snapshots: 'Storage',
  'SAN LUN': 'On-prem & DC', 'Backup repo': 'Backup & DR', 'Recovery vault': 'Backup & DR',
  ALB: 'Network', 'NAT gateway': 'Network', 'Elastic IP': 'Network', CloudFront: 'Network',
  'VPN gateway': 'Network', Firewall: 'On-prem & DC', SQS: 'Integration',
  'Secrets Manager': 'Security & identity', 'Domain controller': 'Security & identity',
  'CloudWatch Logs': 'Observability', 'Print server': 'On-prem & DC',
};

/* ---------- resource blueprint ----------
   name, provider, kind, size, env, region, team, owner, state,
   monthly $, cpu%, mem%, disk%, tagged, waste[why, saving, action]  */
const RES = [
  ['nl-prod-api-01', 'aws', 'EC2', 'm6i.large', 'prod', 'ap-south-1a', 'Platform', 'Aravind Menon', 'running', 78.84, 41, 63, 44, 1, null],
  ['nl-prod-api-02', 'aws', 'EC2', 'm6i.large', 'prod', 'ap-south-1b', 'Platform', 'Aravind Menon', 'running', 78.84, 38, 61, 41, 1, null],
  ['nl-prod-api-03', 'aws', 'EC2', 'm6i.large', 'prod', 'ap-south-1c', 'Platform', 'Aravind Menon', 'degraded', 78.84, 91, 88, 47, 1, null],
  ['nl-prod-worker-01', 'aws', 'EC2', 'c6i.xlarge', 'prod', 'ap-south-1a', 'Payments', 'Sneha Rajan', 'running', 139.24, 57, 49, 38, 1, null],
  ['nl-prod-worker-02', 'aws', 'EC2', 'c6i.xlarge', 'prod', 'ap-south-1b', 'Payments', 'Sneha Rajan', 'running', 139.24, 52, 47, 36, 1, null],
  ['eks-prod-ng-general', 'aws', 'EKS', 'm6i.2xlarge x4', 'prod', 'ap-south-1', 'Platform', 'Aravind Menon', 'running', 631.20, 46, 71, 33, 1, null],
  ['eks-prod-ng-spot', 'aws', 'EKS', 'm6a.xlarge x3 (spot)', 'prod', 'ap-south-1', 'Platform', 'Aravind Menon', 'running', 118.90, 63, 66, 29, 1, null],
  ['eks-dev-ng-general', 'aws', 'EKS', 'm6i.large x2', 'dev', 'ap-south-1', 'Platform', 'Rohit Varma', 'running', 157.80, 6, 22, 18, 1, ['Dev node group runs 24/7 but has no scheduled workload outside 09:00–19:00 IST, five days a week', 102.57, 'Scale the node group to zero on a schedule']],
  ['nl-prod-orders-pg', 'aws', 'RDS', 'db.r6g.xlarge Multi-AZ', 'prod', 'ap-south-1', 'Payments', 'Sneha Rajan', 'available', 512.30, 34, 72, 91, 1, null],
  ['nl-prod-catalog-pg', 'aws', 'RDS', 'db.t4g.large', 'prod', 'ap-south-1', 'Retail Apps', 'Divya Pillai', 'available', 121.60, 27, 58, 44, 1, null],
  ['nl-analytics-pg', 'aws', 'RDS', 'db.r6g.large', 'shared', 'ap-south-1', 'Data', 'Faizal Rahman', 'available', 268.40, 3, 19, 21, 1, ['CPU averaged 3.1% and there were no connections for 21 of the last 30 days — the nightly extract moved to the warehouse in June', 268.40, 'Snapshot and delete']],
  ['nl-prod-redis', 'aws', 'ElastiCache', 'cache.r6g.large', 'prod', 'ap-south-1', 'Platform', 'Aravind Menon', 'available', 168.40, 39, 64, 0, 1, null],
  ['alb-prod-public', 'aws', 'ALB', 'application', 'prod', 'ap-south-1', 'Platform', 'Aravind Menon', 'running', 31.20, 0, 0, 0, 1, null],
  ['alb-legacy-portal', 'aws', 'ALB', 'application', 'prod', 'ap-south-1', 'Retail Apps', 'Divya Pillai', 'running', 22.40, 0, 0, 0, 1, ['Zero requests for 41 days — the legacy supplier portal was cut over to the new storefront on 12 June', 22.40, 'Delete the load balancer and its target group']],
  ['nat-prod-az1', 'aws', 'NAT gateway', 'standard', 'prod', 'ap-south-1a', 'Platform', 'Aravind Menon', 'running', 47.90, 0, 0, 0, 1, null],
  ['nat-dev-az1', 'aws', 'NAT gateway', 'standard', 'dev', 'ap-south-1a', 'Platform', 'Rohit Varma', 'running', 44.60, 0, 0, 0, 1, ['Dev subnets pushed 3.1 GB through this gateway all month — the hourly charge is 94% of the bill', 41.90, 'Replace with a VPC endpoint or a shared NAT instance']],
  ['nl-prod-invoices', 'aws', 'S3', 'Standard · 2.1 TB', 'prod', 'ap-south-1', 'Payments', 'Sneha Rajan', 'available', 96.30, 0, 0, 0, 1, null],
  ['nl-logs-archive', 'aws', 'S3', 'Standard · 6.4 TB', 'shared', 'ap-south-1', 'Platform', 'Aravind Menon', 'available', 214.70, 0, 0, 0, 1, ['No GET requests in 118 days and every object is older than 90 days, but the bucket is still on the Standard class', 161.00, 'Add a lifecycle rule to Glacier Instant Retrieval']],
  ['nl-prod-assets-cdn', 'aws', 'CloudFront', 'distribution', 'prod', 'global', 'Retail Apps', 'Divya Pillai', 'running', 88.10, 0, 0, 0, 1, null],
  ['vol-0f31c8a7', 'aws', 'EBS', 'gp3 · 500 GB', 'dev', 'ap-south-1a', 'Platform', 'Rohit Varma', 'unattached', 41.20, 0, 0, 0, 0, ['Detached from nl-dev-build-04 when that instance was terminated 63 days ago and never cleaned up', 41.20, 'Snapshot, then delete the volume']],
  ['vol-07d9b104', 'aws', 'EBS', 'gp2 · 1 TB', 'prod', 'ap-south-1b', 'Payments', 'Sneha Rajan', 'unattached', 102.40, 0, 0, 0, 0, ['Unattached for 38 days. It was the old orders database data volume, kept "just in case" after the r6g migration', 102.40, 'Keep the snapshot, delete the volume']],
  ['eipalloc-04b2e7', 'aws', 'Elastic IP', 'IPv4', 'prod', 'ap-south-1', 'Platform', 'Aravind Menon', 'unassociated', 3.65, 0, 0, 0, 0, ['Not associated with any instance or interface for 74 days — idle public IPv4 is billed by the hour', 3.65, 'Release the address']],
  ['eipalloc-0c81f9', 'aws', 'Elastic IP', 'IPv4', 'dev', 'ap-south-1', 'Platform', 'Rohit Varma', 'unassociated', 3.65, 0, 0, 0, 0, ['Not associated with anything for 51 days', 3.65, 'Release the address']],
  ['nl-snapshots-legacy', 'aws', 'Snapshots', '4.2 TB · 318 snapshots', 'shared', 'ap-south-1', 'Platform', 'Aravind Menon', 'available', 210.00, 0, 0, 0, 0, ['318 manual snapshots with no retention tag, the oldest from 2024. Only 11 of them are referenced by an AMI', 168.00, 'Apply a 35-day retention policy through Data Lifecycle Manager']],
  ['lambda-invoice-parser', 'aws', 'Lambda', '1024 MB · 2.1M inv', 'prod', 'ap-south-1', 'Payments', 'Sneha Rajan', 'running', 12.40, 0, 0, 0, 1, null],
  ['lambda-webhook-relay', 'aws', 'Lambda', '512 MB · 840k inv', 'prod', 'ap-south-1', 'Platform', 'Aravind Menon', 'running', 6.10, 0, 0, 0, 1, null],
  ['prod-orders-queue', 'aws', 'SQS', 'standard', 'prod', 'ap-south-1', 'Payments', 'Sneha Rajan', 'running', 4.20, 0, 0, 0, 1, null],
  ['nl-prod-secrets', 'aws', 'Secrets Manager', '46 secrets', 'prod', 'ap-south-1', 'Platform', 'Aravind Menon', 'available', 18.40, 0, 0, 0, 1, null],
  ['cw-logs-prod', 'aws', 'CloudWatch Logs', '412 GB ingest', 'shared', 'ap-south-1', 'Platform', 'Aravind Menon', 'available', 143.20, 0, 0, 0, 1, ['Nineteen log groups have retention set to Never expire, including two debug groups left on after the June release', 61.80, 'Set 30-day retention on the debug groups']],
  ['nl-stg-api-01', 'aws', 'EC2', 't3.large', 'staging', 'ap-south-1a', 'Platform', 'Rohit Varma', 'running', 60.74, 7, 31, 26, 1, ['Staging runs around the clock but sees traffic only during working hours', 39.48, 'Attach the office-hours start/stop schedule']],
  ['nl-stg-worker-01', 'aws', 'EC2', 't3.medium', 'staging', 'ap-south-1b', 'Payments', 'Rohit Varma', 'running', 30.37, 9, 28, 22, 1, ['Same picture as nl-stg-api-01 — idle nights and weekends', 19.74, 'Attach the office-hours start/stop schedule']],
  ['nl-dev-sandbox-01', 'aws', 'EC2', 't3.xlarge', 'dev', 'ap-south-1a', 'Data', 'Faizal Rahman', 'running', 121.47, 2, 14, 11, 1, ['CPU peaked at 4% in 30 days. It was raised for a one-off pandas job in May and never stopped', 121.47, 'Stop the instance, keep the root volume for 30 days']],
  ['nl-dev-bastion', 'aws', 'EC2', 't3.micro', 'dev', 'ap-south-1a', 'Platform', 'Rohit Varma', 'running', 7.59, 3, 22, 14, 1, null],
  ['nl-prod-bastion', 'aws', 'EC2', 't3.small', 'prod', 'ap-south-1a', 'Platform', 'Aravind Menon', 'running', 15.18, 5, 26, 17, 1, null],
  ['nl-me-prod-api-01', 'aws', 'EC2', 'm6i.large', 'prod', 'me-central-1a', 'Facilities IT', 'Yousef Al Harbi', 'running', 86.90, 33, 57, 39, 1, null],
  ['nl-me-prod-api-02', 'aws', 'EC2', 'm6i.large', 'prod', 'me-central-1b', 'Facilities IT', 'Yousef Al Harbi', 'running', 86.90, 29, 54, 37, 1, null],

  ['kcf-prod-web-vm01', 'azure', 'VM', 'Standard_D4s_v5', 'prod', 'centralindia', 'Retail Apps', 'Divya Pillai', 'running', 175.20, 44, 68, 51, 1, null],
  ['kcf-prod-web-vm02', 'azure', 'VM', 'Standard_D4s_v5', 'prod', 'centralindia', 'Retail Apps', 'Divya Pillai', 'running', 175.20, 39, 65, 49, 1, null],
  ['aks-retail-prod', 'azure', 'AKS', 'Standard_D4as_v5 x3', 'prod', 'centralindia', 'Retail Apps', 'Divya Pillai', 'running', 396.00, 51, 74, 36, 1, null],
  ['aks-retail-stg', 'azure', 'AKS', 'Standard_B4ms x2', 'staging', 'centralindia', 'Retail Apps', 'Rohit Varma', 'running', 121.00, 8, 34, 24, 1, ['Staging cluster is up 720 hours a month and is used for roughly 45 of them', 78.65, 'Stop the node pool outside 09:00–19:00 IST']],
  ['kcf-prod-sql', 'azure', 'Azure SQL', 'S3 · 100 DTU', 'prod', 'centralindia', 'Retail Apps', 'Divya Pillai', 'available', 232.50, 41, 0, 62, 1, null],
  ['kcf-stg-sql', 'azure', 'Azure SQL', 'S1 · 20 DTU', 'staging', 'centralindia', 'Retail Apps', 'Rohit Varma', 'available', 74.40, 6, 0, 29, 1, ['Average DTU use is 6% and peak is 14% — an S0 tier covers it', 44.60, 'Drop to the S0 service tier']],
  ['kcfprodstorage', 'azure', 'Storage account', 'Hot LRS · 1.4 TB', 'prod', 'centralindia', 'Retail Apps', 'Divya Pillai', 'available', 63.90, 0, 0, 0, 1, null],
  ['kcfstgdiag', 'azure', 'Storage account', 'Hot LRS · 900 GB', 'staging', 'centralindia', 'Platform', 'Rohit Varma', 'available', 28.70, 0, 0, 0, 0, ['Boot diagnostics container from VMs that were deleted in March. No reads since', 28.70, 'Delete the storage account']],
  ['kcf-dev-vm05', 'azure', 'VM', 'Standard_D2s_v3', 'dev', 'centralindia', 'Data', 'Faizal Rahman', 'stopped', 34.20, 0, 0, 0, 1, ['Stopped from inside the guest OS, not deallocated — Azure still bills the compute', 34.20, 'Deallocate the VM from the portal or CLI']],
  ['jed-fac-app-vm01', 'azure', 'VM', 'Standard_D2s_v5', 'prod', 'uaenorth', 'Facilities IT', 'Yousef Al Harbi', 'running', 96.40, 36, 59, 68, 1, null],
  ['jed-fac-vpn-gw', 'azure', 'VPN gateway', 'VpnGw1', 'prod', 'uaenorth', 'Facilities IT', 'Yousef Al Harbi', 'running', 138.70, 0, 0, 0, 1, null],
  ['kcf-backup-vault', 'azure', 'Recovery vault', 'GRS · 3.8 TB', 'prod', 'centralindia', 'Platform', 'Aravind Menon', 'available', 118.30, 0, 0, 0, 1, null],

  ['koc-esx-03', 'onprem', 'ESXi host', 'Dell R650 · 2x24c · 512 GB', 'shared', 'koc-dc1', 'Platform', 'Manoj Kurian', 'running', 410.00, 62, 71, 58, 1, null],
  ['koc-esx-04', 'onprem', 'ESXi host', 'Dell R650 · 2x24c · 512 GB', 'shared', 'koc-dc1', 'Platform', 'Manoj Kurian', 'running', 410.00, 17, 24, 31, 1, ['Host sits at 17% CPU and 24% memory. The nine VMs on it fit inside koc-esx-03 headroom', 410.00, 'vMotion the guests and power the host down']],
  ['koc-san-lun01', 'onprem', 'SAN LUN', '12 TB · RAID 10', 'shared', 'koc-dc1', 'Platform', 'Manoj Kurian', 'available', 260.00, 0, 0, 78, 1, null],
  ['koc-veeam-repo', 'onprem', 'Backup repo', '24 TB · 68% used', 'shared', 'koc-dc1', 'Platform', 'Manoj Kurian', 'degraded', 180.00, 0, 0, 68, 1, null],
  ['jed-fw-01', 'onprem', 'Firewall', 'FortiGate 100F', 'prod', 'jed-dc1', 'Facilities IT', 'Yousef Al Harbi', 'running', 145.00, 22, 41, 0, 1, null],
  ['jed-ad-dc01', 'onprem', 'Domain controller', 'Windows Server 2022', 'prod', 'jed-dc1', 'Facilities IT', 'Yousef Al Harbi', 'running', 60.00, 12, 47, 33, 1, null],
  ['koc-print-srv', 'onprem', 'Print server', 'Windows Server 2019', 'shared', 'koc-dc1', 'Facilities IT', 'Manoj Kurian', 'running', 22.00, 1, 18, 12, 0, ['No print jobs in 64 days — the Kochi office moved to the follow-me queue on the Jeddah server', 22.00, 'Decommission after a two-week notice period']],
];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* the cost centre a team charges to — used when the tag is first applied */
export const costCentreFor = (team) => (team === 'Facilities IT' ? 'CC-4400'
  : team === 'Payments' ? 'CC-2100'
    : team === 'Data' ? 'CC-3300'
      : team === 'Retail Apps' ? 'CC-2600' : 'CC-1000');

function makeResources(rnd) {
  return RES.map((r, i) => {
    const [name, provider, kind, size, env, region, team, owner, state, cost, cpu, mem, disk, tagged, waste] = r;
    const service = SERVICE_OF[kind] || 'Other';
    const tags = { Environment: env, Service: service, Team: team };
    if (tagged) { tags.Owner = owner; tags.CostCentre = costCentreFor(team); tags.ManagedBy = provider === 'onprem' ? 'manual' : 'terraform'; }
    return {
      id: slug(name),
      name, provider, kind, size, env, region, team, owner, state, service,
      cost: Number(cost.toFixed(2)),
      util: { cpu, mem, disk, net: Math.round(4 + rnd() * 180) },
      tags,
      tagged: !!tagged,
      ageDays: 40 + Math.floor(rnd() * 800),
      lastSeenHrs: Math.floor(rnd() * 3),
      waste: waste ? { why: waste[0], saving: Number(waste[1].toFixed(2)), action: waste[2] } : null,
      note: '',
    };
  });
}

/* ---------- cost history ---------- */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BASE_FACTOR = [0.84, 0.87, 0.89, 0.92, 0.94, 0.96, 1.00];
/* services that moved differently from the baseline */
const DRIFT = {
  Kubernetes: [0.62, 0.64, 0.66, 0.68, 0.70, 0.72, 1.00],
  Storage: [0.71, 0.74, 0.79, 0.84, 0.89, 0.94, 1.00],
  Observability: [0.58, 0.60, 0.63, 0.66, 0.71, 0.78, 1.00],
  'On-prem & DC': [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
  Databases: [0.96, 0.97, 0.98, 0.99, 1.02, 1.01, 1.00],
};

function makeMonths(resources) {
  const byService = {};
  for (const r of resources) byService[r.service] = (byService[r.service] || 0) + r.cost;
  const now = new Date();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const idx = 6 - i;
    const svc = {};
    let total = 0;
    for (const [name, base] of Object.entries(byService)) {
      const f = (DRIFT[name] || BASE_FACTOR)[idx];
      const v = Number((base * f).toFixed(2));
      svc[name] = v; total += v;
    }
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH_NAMES[d.getMonth()],
      year: d.getFullYear(),
      total: Number(total.toFixed(2)),
      byService: svc,
      current: i === 0,
    });
  }
  return out;
}

/* ---------- alerts ---------- */
const at = (daysAgo, hh, mm) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

const ALERTS = [
  ['critical', 'FreeStorageSpace below 8% on nl-prod-orders-pg', 'nl-prod-orders-pg', 'Databases', 'CloudWatch', at(0, 1, 12),
    '11.4 GB free of 200 GB. WAL retention grew after the replication slot on the reporting replica stalled at 02:41 yesterday.',
    'Runbook DB-04: drop the stale replication slot, then extend storage by 100 GB.'],
  ['critical', 'Node not ready: ip-10-42-6-118 in eks-prod-ng-general', 'eks-prod-ng-general', 'Kubernetes', 'Alertmanager', at(0, 2, 34),
    'Kubelet stopped reporting for 6 minutes. Eleven pods were evicted and rescheduled onto the spot node group.',
    'Runbook K8S-02: cordon, drain, replace the node from the ASG.'],
  ['high', 'CPUUtilization above 90% for 15 minutes on nl-prod-api-03', 'nl-prod-api-03', 'Compute', 'CloudWatch', at(0, 3, 5),
    'Sustained 91% since the queue backlog started draining. The target group marked the instance unhealthy twice.',
    'Runbook APP-01: scale the ASG out by one and check the slow query log.'],
  ['high', 'Backup job failed: koc-veeam-repo (Kochi file server)', 'koc-veeam-repo', 'Backup & DR', 'Veeam B&R', at(0, 4, 20),
    'Job "KOC-Fileserver-Daily" failed at 04:20 with a repository timeout. Last good restore point is 26 hours old.',
    'Runbook BK-02: rerun the job, then check repository latency on koc-san-lun01.'],
  ['warning', 'TargetResponseTime p95 above 2s on alb-prod-public', 'alb-prod-public', 'Network', 'CloudWatch', at(0, 9, 48),
    'p95 held at 2.4s for 12 minutes during the morning order push. No 5xx recorded.',
    'Runbook APP-03: confirm the connection pool size on the order workers.'],
  ['warning', 'Certificate expires in 12 days: *.northline.co.in', 'alb-prod-public', 'Security & identity', 'ACM', at(1, 8, 10),
    'The wildcard certificate on the public load balancer renews manually because the DNS validation record was removed.',
    'Runbook SEC-05: restore the CNAME validation record and re-issue.'],
  ['high', 'Disk usage 92% on jed-fac-app-vm01 (/var)', 'jed-fac-app-vm01', 'Compute', 'Zabbix', at(1, 21, 6),
    'Application log rotation stopped after the 14 July package upgrade reset logrotate.conf.',
    'Runbook OS-01: rotate and compress, then reinstate the logrotate drop-in.'],
  ['warning', 'DTU above 80% for 20 minutes on kcf-prod-sql', 'kcf-prod-sql', 'Databases', 'Azure Monitor', at(2, 11, 32),
    'The stock reconciliation job overlapped with the storefront catalogue rebuild.',
    'Runbook DB-07: stagger the two jobs by 30 minutes.'],
  ['info', 'New IAM access key created for svc-deploy', 'nl-prod-secrets', 'Security & identity', 'CloudTrail', at(2, 15, 2),
    'Key AKIA…7QF2 was created by the pipeline role during the release. The previous key is still active.',
    'Runbook SEC-02: deactivate the superseded key after the next successful deploy.'],
  ['high', 'VPN tunnel down: jed-dc1 to me-central-1', 'jed-fac-vpn-gw', 'Network', 'Azure Monitor', at(3, 2, 18),
    'Tunnel flapped four times overnight before settling. Phase 2 rekey mismatch with the FortiGate.',
    'Runbook NET-04: align the phase 2 lifetime on both ends.'],
  ['warning', 'Unattached EBS volume older than 30 days: vol-07d9b104', 'vol-07d9b104', 'Storage', 'Cost guard', at(4, 6, 0),
    'A 1 TB gp2 volume has been unattached for 38 days and is still billed at the full rate.',
    'Runbook FIN-01: snapshot and delete, or tag with a keep-until date.'],
  ['critical', 'Site to site link down: koc-dc1 uplink', 'jed-fw-01', 'On-prem & DC', 'Nagios', at(6, 23, 41),
    'Primary fibre uplink dropped for 22 minutes. Traffic failed over to the backup broadband circuit.',
    'Runbook NET-01: raise a ticket with the circuit provider, keep failover in place until confirmed.'],
  ['warning', 'ECR image scan: 3 high CVEs in orders-api:2026.07.3', 'eks-prod-ng-general', 'Security & identity', 'ECR', at(7, 10, 15),
    'Three high severity findings in the base image, all fixed in the 3.19.2 patch release.',
    'Runbook SEC-08: rebuild on the patched base image and redeploy.'],
  ['info', 'Reserved instance coverage dropped to 61%', 'eks-prod-ng-general', 'Compute', 'Cost guard', at(9, 7, 30),
    'Two one-year compute savings plans expired on the first of the month.',
    'Runbook FIN-03: re-purchase against the current steady-state usage.'],
];

function makeAlerts() {
  return ALERTS.map((a, i) => {
    const [sev, title, resource, service, source, opened, detail, runbook] = a;
    return {
      id: `AL-${String(2400 + i * 7).padStart(4, '0')}`,
      sev, title, resource, service, source, opened, detail, runbook,
      status: 'open',
      ackBy: null,
      ackAt: null,
      timeline: [{ t: opened, who: source, text: 'Alert opened' }],
    };
  });
}

/* ---------- access ---------- */
const USERS = [
  ['Aravind Menon', 'aravind.menon@northline.co.in', 'Platform', 'Admin', 'AWS IAM', 1, 0.2, 41, 'active'],
  ['Sneha Rajan', 'sneha.rajan@northline.co.in', 'Payments', 'Admin', 'AWS IAM', 1, 0.6, 88, 'active'],
  ['Rohit Varma', 'rohit.varma@northline.co.in', 'Platform', 'Power user', 'AWS IAM', 1, 1.1, 120, 'active'],
  ['Divya Pillai', 'divya.pillai@kcfoods.in', 'Retail Apps', 'Admin', 'Entra ID', 0, 2.0, 0, 'active'],
  ['Faizal Rahman', 'faizal.rahman@northline.co.in', 'Data', 'Power user', 'AWS IAM', 0, 3.4, 402, 'active'],
  ['Manoj Kurian', 'manoj.kurian@northline.co.in', 'Platform', 'Admin', 'on-prem AD', 1, 0.9, 0, 'active'],
  ['Yousef Al Harbi', 'yousef.alharbi@jedfacilities.sa', 'Facilities IT', 'Admin', 'Entra ID', 1, 1.4, 0, 'active'],
  ['Nithya Suresh', 'nithya.suresh@kcfoods.in', 'Retail Apps', 'Developer', 'Entra ID', 1, 2.2, 0, 'active'],
  ['Ashraf Kunhi', 'ashraf.kunhi@jedfacilities.sa', 'Facilities IT', 'Read only', 'Entra ID', 0, 74, 0, 'stale'],
  ['Priya Nair', 'priya.nair@northline.co.in', 'Data', 'Developer', 'AWS IAM', 1, 96, 611, 'stale'],
  ['Vishnu Prasad', 'vishnu.prasad@northline.co.in', 'Payments', 'Developer', 'AWS IAM', 0, 132, 540, 'stale'],
  ['Reena Thomas', 'reena.thomas@kcfoods.in', 'Retail Apps', 'Billing', 'Entra ID', 1, 12, 0, 'active'],
  ['Sajid Ali', 'sajid.ali@jedfacilities.sa', 'Facilities IT', 'Developer', 'on-prem AD', 0, 8, 0, 'active'],
  ['svc-deploy', 'svc-deploy@northline.co.in', 'Platform', 'Admin', 'AWS IAM', 0, 0.1, 3, 'service'],
  ['svc-backup', 'svc-backup@northline.co.in', 'Platform', 'Power user', 'on-prem AD', 0, 0.4, 794, 'service'],
];

export const OFFBOARD_STEPS = [
  'Disable the directory account and revoke active sessions',
  'Deactivate and delete cloud access keys',
  'Remove from VPN and bastion allow lists',
  'Transfer ownership of resources tagged to the user',
  'Remove from source control and pipeline groups',
  'Collect the laptop and any hardware token',
  'Archive the mailbox and set a forwarding rule',
];

function makeUsers() {
  return USERS.map((u, i) => {
    const [name, email, team, role, directory, mfa, lastLoginDays, keyAgeDays, status] = u;
    const d = new Date();
    d.setTime(d.getTime() - lastLoginDays * 86400000);
    return {
      id: `U-${String(101 + i)}`,
      name, email, team, role, directory,
      mfa: !!mfa,
      lastLogin: d.toISOString(),
      lastLoginDays,
      keyAgeDays,
      status,
      offboarding: null,
    };
  });
}

/* ---------- uptime ---------- */
const SERVICES = [
  ['Checkout API', 'Tier 1', 99.95, 'eks-prod-ng-general'],
  ['Orders API', 'Tier 1', 99.95, 'nl-prod-orders-pg'],
  ['Storefront', 'Tier 1', 99.9, 'aks-retail-prod'],
  ['Payments webhook', 'Tier 1', 99.9, 'lambda-webhook-relay'],
  ['Warehouse sync', 'Tier 2', 99.5, 'nl-prod-worker-01'],
  ['Admin console', 'Tier 2', 99.5, 'kcf-prod-web-vm01'],
  ['Facilities VPN', 'Tier 2', 99.5, 'jed-fac-vpn-gw'],
  ['Mail relay', 'Tier 3', 99.0, 'jed-ad-dc01'],
];
/* planted incidents: [service index, days ago, status, minutes down] */
const INCIDENTS = [
  [0, 0, 'deg', 18], [1, 0, 'deg', 26], [3, 1, 'down', 9],
  [4, 6, 'down', 22], [6, 3, 'deg', 41], [2, 12, 'down', 14],
  [5, 19, 'deg', 33], [7, 24, 'down', 51], [0, 21, 'deg', 12],
];

function makeUptime(rnd) {
  const svc = SERVICES.map(([name, tier, slo, resource]) => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ day: d.toISOString().slice(0, 10), status: 'up', mins: 0, pct: 100 });
    }
    return { id: slug(name), name, tier, slo, resource, days };
  });
  for (const [si, daysAgo, status, mins] of INCIDENTS) {
    const s = svc[si];
    const idx = 29 - daysAgo;
    if (idx < 0 || idx > 29) continue;
    s.days[idx].status = status;
    s.days[idx].mins = mins;
    s.days[idx].pct = Number((100 - (mins / 1440) * 100).toFixed(3));
  }
  for (const s of svc) {
    /* a little harmless jitter so the strips are not perfectly flat */
    for (const d of s.days) {
      if (d.status === 'up' && rnd() > 0.94) { d.pct = Number((99.95 + rnd() * 0.04).toFixed(3)); }
    }
    s.uptime30 = Number((s.days.reduce((a, d) => a + d.pct, 0) / 30).toFixed(3));
    s.downMins = s.days.reduce((a, d) => a + d.mins, 0);
  }
  return svc;
}

/* ---------- seed ---------- */
export function seedState() {
  const rnd = seeded(20260806);
  const resources = makeResources(rnd);
  return {
    version: 1,
    seededAt: new Date().toISOString(),
    org: ORG.name,
    resources,
    months: makeMonths(resources),
    alerts: makeAlerts(),
    users: makeUsers(),
    services: makeUptime(rnd),
    cleanup: {},        /* resourceId -> 'planned' | 'dismissed' */
    reports: [],        /* generated monthly reviews */
    activity: [
      { t: new Date(Date.now() - 3600000 * 2).toISOString(), text: 'Cost guard flagged 2 unattached volumes' },
      { t: new Date(Date.now() - 3600000 * 7).toISOString(), text: 'eks-prod-ng-general scaled from 3 to 4 nodes' },
      { t: new Date(Date.now() - 3600000 * 26).toISOString(), text: 'Access review opened for 3 stale accounts' },
    ],
  };
}

export const store = createStore(STORE_KEY, seedState);

/* ---------- derived helpers used across views ---------- */
export const money2 = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const money0 = (n) => `$${Math.round(Number(n || 0)).toLocaleString('en-US')}`;
export const sar = (n) => `SAR ${Math.round(Number(n || 0) * ORG.sarRate).toLocaleString('en-US')}`;

export const monthlyTotal = (s) => s.resources.reduce((a, r) => a + r.cost, 0);
export const openAlerts = (s) => s.alerts.filter((a) => a.status === 'open');
export const wasteItems = (s) => s.resources
  .filter((r) => r.waste && s.cleanup[r.id] !== 'dismissed')
  .sort((a, b) => b.waste.saving - a.waste.saving);
export const totalWaste = (s) => wasteItems(s).reduce((a, r) => a + r.waste.saving, 0);
export const staleUsers = (s) => s.users.filter((u) => u.status === 'stale');
export const adminsNoMfa = (s) => s.users.filter((u) => (u.role === 'Admin' || u.role === 'Power user') && !u.mfa);
export const groupSum = (rows, key, val = (r) => r.cost) => {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + val(r));
  return [...m.entries()].map(([k, v]) => ({ label: k, value: Number(v.toFixed(2)) })).sort((a, b) => b.value - a.value);
};
export const fleetUptime = (s) => Number((s.services.reduce((a, x) => a + x.uptime30, 0) / s.services.length).toFixed(3));
export function projection(s) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  const run = monthlyTotal(s);
  return { day, daysInMonth, mtd: Number((run * (day / daysInMonth)).toFixed(2)), projected: Number(run.toFixed(2)) };
}
