import type { ReactNode } from 'react';
import {
  CalendarDot as CalendarClock,
  ShieldCheck,
  UserMinus as UserX,
  Package as PackageX,
  Buildings as Building2,
  Users,
  Clock as Clock3,
  CheckCircle as CheckCircle2,
} from '@phosphor-icons/react';
import type { CancellationPolicy } from '../../types/types-index';
import { CANCELLATION_POLICY_STATIC_SECTIONS as STATIC, tierLabel } from '../../constants/cancellationPolicy';

interface CancellationPolicyDisplayProps {
  policy: CancellationPolicy;
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
    <div className="bg-white rounded-lg border border-background-warm p-6">
      <h3 className="flex items-center gap-2.5 font-display font-bold text-dark text-lg mb-3">
        <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
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
            <div key={i} className="bg-background-warm rounded-lg p-4">
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

      <p className="text-xs text-dark-muted bg-background-warm rounded-lg px-4 py-3">{STATIC.acceptance}</p>
    </div>
  );
}
