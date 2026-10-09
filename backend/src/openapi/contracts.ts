import type { Schema } from './schemas.js';
import {
  array,
  bool,
  enumeration,
  integer,
  json,
  nullable,
  object,
  ref,
  str,
  uuid,
} from './schemas.js';

export function publicResponse(path: string, method: string): Schema {
  const route = path.replace(/^\/api/, '');
  if (route === '/auth/me') return ref('PublicUser');
  if (route === '/auth/login') return ref('PublicLogin');
  if (route === '/auth/register') return ref('PublicBroker');
  if (route === '/health/live') return object({ status: enumeration('alive') });
  if (route === '/health/ready')
    return object({
      status: enumeration('ready'),
      dependencies: object({ database: str, queue: str }),
    });
  if (route === '/agenda') return ref('PublicAgenda');
  if (route === '/scheduling/suggestions') return ref('PublicSuggestions');
  if (route.startsWith('/scheduling/reservations'))
    return method === 'get'
      ? array(ref('PublicReservation'))
      : ref('PublicReservation');
  if (route.startsWith('/scheduling/blocks'))
    return method === 'delete'
      ? object({ id: uuid, deleted: bool })
      : ref('PublicBlock');
  if (route === '/commercial/pipeline') return ref('PublicPipeline');
  if (/\/commercial\/documents\/[^/]+\/pdf$/.test(route))
    return { type: 'string', format: 'binary' };
  if (route.startsWith('/commercial/documents'))
    return route === '/commercial/documents' && method === 'get'
      ? ref('PublicDocumentPage')
      : ref('PublicDocument');
  if (/\/commercial\/opportunities\/[^/]+\/installments$/.test(route))
    return array(ref('PublicInstallment'));
  if (route.startsWith('/commercial/installments'))
    return ref('PublicInstallment');
  if (route.startsWith('/commercial/opportunities'))
    return route === '/commercial/opportunities' && method === 'get'
      ? ref('PublicOpportunityPage')
      : ref('PublicOpportunity');
  if (/\/leads\/[^/]+\/conversations$/.test(route))
    return ref('PublicConversationCursorPage');
  if (route === '/conversations')
    return method === 'get'
      ? array(ref('PublicConversation'))
      : ref('PublicConversation');
  if (/\/conversations\/[^/]+\/messages$/.test(route))
    return method === 'get'
      ? array(ref('PublicMessage'))
      : ref('PublicSendMessageResult');
  if (/\/conversations\/[^/]+\/proposals$/.test(route))
    return array(ref('PublicProposal'));
  if (route.includes('/proposals/') && route.endsWith('/decision'))
    return ref('PublicProposalDecision');
  if (route.endsWith('/content'))
    return object({ status: enumeration('anonymized') });
  if (route === '/ai/preferences/extract') return ref('PublicExtraction');
  if (route === '/leads/import') return ref('PublicImportReport');
  if (route === '/leads/funnel')
    return array(object({ stage: str, count: integer }));
  if (/\/leads\/[^/]+\/preferences$/.test(route))
    return nullable(ref('PublicPreference'));
  if (route.includes('/matches'))
    return method === 'get' ? ref('PublicMatchCursorPage') : ref('PublicMatch');
  if (route.includes('/interactions'))
    return method === 'get'
      ? ref('PublicInteractionCursorPage')
      : ref('PublicInteraction');
  if (route.includes('/leads/') && route.endsWith('/messages'))
    return method === 'get'
      ? array(ref('PublicMessage'))
      : ref('PublicMessage');
  if (route.endsWith('/stage'))
    return {
      oneOf: [
        ref('PublicLead'),
        object({ id: uuid, stage: str, stageHistoryId: uuid }),
      ],
    };
  if (route === '/leads')
    return method === 'get' ? ref('PublicLeadPage') : ref('PublicLead');
  if (route.startsWith('/leads/')) return ref('PublicLead');
  if (route.endsWith('/compatibility')) return ref('PublicCompatibility');
  if (route === '/properties')
    return method === 'get' ? ref('PublicPropertyPage') : ref('PublicProperty');
  if (route.startsWith('/properties/')) return ref('PublicProperty');
  if (route === '/visits')
    return method === 'get' ? ref('PublicVisitCursorPage') : ref('PublicVisit');
  if (route.endsWith('/calendar-event'))
    return nullable(ref('PublicCalendarEvent'));
  if (route.endsWith('/calendar-sync')) return ref('PublicJob');
  if (route.startsWith('/visits/')) return ref('PublicVisit');
  if (route === '/tasks')
    return method === 'get' ? ref('PublicTaskCursorPage') : ref('PublicTask');
  if (route.startsWith('/tasks/')) return ref('PublicTask');
  if (route === '/operations/metrics/ai') return array(ref('PublicAiMetric'));
  if (route === '/operations/metrics') return array(ref('PublicJobMetric'));
  if (route === '/operations/jobs') return array(ref('PublicJob'));
  if (route.startsWith('/operations/jobs/')) return ref('PublicJob');
  if (route.startsWith('/follow-ups')) return ref('PublicFollowUp');
  if (route.startsWith('/imports/properties')) return ref('PublicImportBatch');
  return json;
}
