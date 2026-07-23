import type { ReactNode } from 'react';
import { CalendarClock, ShieldCheck, UserX, PackageX, Building2, Users, Clock3, CheckCircle2 } from 'lucide-react';
import type { CancellationPolicy, CancellationTier } from '../../types';
import { CANCELLATION_POLICY_STATIC_SECTIONS as STATIC } from '../../constants/cancellationPolicy';

interface CancellationPolicyDisplayProps {
  policy: CancellationPolicy;
}

function tierLabel(tier: CancellationTier): string {
  if (tier.max_days === null && tier.min_days !== null) return `More than ${tier.min_days} days before departure`;
  if (tier.min_days !== null && tier.max_days !== null) return `${tier.min_days}–${tier.max_days} days before departure`;
  if (tier.min_days === null && tier.max_days !== null) return `Within ${tier.max_days} days of departure`;
  return 'Cancellation window';
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-background-warm p-6">
      <h3 className="flex items-center gap-2.5 font-display font-bold text-dark text-lg mb-3">
        <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </span>
        {title}
      </h3>
      <div className="text-dark-muted text-sm leading-relaxed space-y-2 pl-[46px]">{children}</div>
    </div>
  );
}

export default function CancellationPolicyDisplay({ policy }: CancellationPolicyDisplayProps) {
  return (
    <div className="space-y-4">
      <SectionCard icon={<ShieldCheck size={18} />} title="Booking Confirmation">
        {STATIC.bookingConfirmation.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </SectionCard>

      <SectionCard icon={<Clock3 size={18} />} title="Payment Schedule">
        <p>
          The remaining trip balance must be paid at least{' '}
          <span className="font-semibold text-dark">{policy.payment_due_days} days</span> before the departure date, unless
          otherwise communicated.
        </p>
        <p>Failure to complete the payment by the due date may result in automatic cancellation of your booking without prior notice.</p>
      </SectionCard>

      <SectionCard icon={<CalendarClock size={18} />} title="Cancellation by Participant">
        <div className="space-y-3">
          {policy.tiers.map((tier, i) => (
            <div key={i} className="bg-background-warm rounded-xl p-4">
              <p className="font-button font-semibold text-dark text-sm mb-1">{tierLabel(tier)}</p>
              <p className="text-dark-muted text-sm leading-relaxed">{tier.description}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={<UserX size={18} />} title="No Show">
        <p>{STATIC.noShow}</p>
      </SectionCard>

      <SectionCard icon={<PackageX size={18} />} title="Missed Services">
        <p>{STATIC.missedServices}</p>
      </SectionCard>

      <SectionCard icon={<Building2 size={18} />} title="Trip Cancellation by Organizer">
        {STATIC.organizerCancellation.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </SectionCard>

      <SectionCard icon={<Users size={18} />} title="Minimum Group Size">
        <p>{STATIC.minimumGroupSize.intro}</p>
        <ul className="list-disc list-inside space-y-1">
          {STATIC.minimumGroupSize.options.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard icon={<CheckCircle2 size={18} />} title="Refund Timeline">
        <p>
          Where applicable, approved refunds will be processed within{' '}
          <span className="font-semibold text-dark">
            {policy.refund_min_days}–{policy.refund_max_days} working days
          </span>
          , subject to the receipt of refunds from the respective third-party service providers.
        </p>
      </SectionCard>

      <p className="text-xs text-dark-muted bg-background-warm rounded-xl px-4 py-3">{STATIC.acceptance}</p>
    </div>
  );
}
