import type { StoryDraft } from '../types';

/**
 * SYNTHETIC DEMONSTRATION DATA ONLY.
 * These stories are invented to show how the app works. They do not describe
 * any real person, employer, product or event. Organisation names are generic
 * placeholders on purpose — do not replace them with real ones in this file.
 */
export const SAMPLE_STORIES: StoryDraft[] = [
  {
    title: 'Rescuing a delayed release',
    competency: 'Ownership',
    headline:
      'I took ownership of a release that was slipping and delivered it two days early by cutting scope with the team, not around it.',
    situation:
      'At a fictional mid-sized software company ("Example Co."), our team of six was three weeks from a committed launch date for a new reporting feature, and we were about two weeks behind plan.',
    task:
      'As the most senior engineer on the team, I needed to get the release back on track without burning people out or silently dropping quality.',
    personalActions: [
      'Mapped every remaining task with an honest estimate in a one-hour workshop.',
      'Split the work into "must ship" and "can follow in two weeks" with the product owner.',
      'Paired with a newer colleague on the riskiest integration so knowledge was shared.',
      'Sent a short status note to stakeholders every Friday with the real numbers.',
    ],
    decisionOrTradeoff:
      'I chose to delay two nice-to-have export formats rather than ask the team to work weekends. Less scope at launch, but a sustainable pace and no rushed code.',
    result:
      'We launched two days before the deadline with zero critical bugs in the first month. The deferred formats shipped two weeks later.',
    followUpQuestions: [
      'How did the product owner react to cutting scope?',
      'What would you do differently next time?',
      'How did you know the estimates were honest?',
    ],
    usefulPhrases: [
      'The first thing I did was get an honest picture of where we were.',
      'I made a deliberate trade-off between…',
      'What I learned from this was…',
    ],
  },
  {
    title: 'Disagreeing about a design approach',
    competency: 'Conflict resolution',
    headline:
      'I resolved a disagreement with a colleague over an architecture decision by turning opinions into a small, shared experiment.',
    situation:
      'On a fictional internal tools team, a colleague and I strongly disagreed on whether to build a new service or extend an existing one. Meetings were becoming tense.',
    task:
      'I wanted to reach a decision the whole team could support and to protect my working relationship with my colleague.',
    personalActions: [
      'Asked for a one-to-one conversation to understand their concerns fully.',
      'Wrote down both options with the same criteria: cost, risk and time to deliver.',
      'Proposed a two-day spike to test the riskiest assumption of each option.',
      'Presented the results together with my colleague, not against them.',
    ],
    decisionOrTradeoff:
      'Spending two days on experiments delayed the start of the work, but it replaced a debate about opinions with evidence.',
    result:
      'The spike showed that extending the existing service was faster. We went with my colleague\'s original idea, and we collaborated well on the next three projects.',
    followUpQuestions: [
      'What if the experiment had supported your option?',
      'How did you keep the conversation from becoming personal?',
    ],
    usefulPhrases: [
      'I wanted to understand their perspective first.',
      'We agreed on the criteria before we compared the options.',
      'In the end, the data made the decision for us.',
    ],
  },
  {
    title: 'Improving onboarding for new joiners',
    competency: 'Leadership',
    headline:
      'Without a formal mandate, I redesigned onboarding for our department and cut the time new joiners needed to become productive.',
    situation:
      'In a fictional operations department of about forty people, new joiners said onboarding was confusing and it took them roughly six weeks to work independently.',
    task:
      'Nobody owned onboarding. I volunteered to improve it alongside my normal responsibilities.',
    personalActions: [
      'Interviewed five recent joiners about what had slowed them down.',
      'Created a two-week checklist with one clear owner for each step.',
      'Set up a buddy rota and recruited six volunteers.',
      'Collected feedback after every new joiner and updated the checklist monthly.',
    ],
    decisionOrTradeoff:
      'I kept the first version very simple — a shared checklist — instead of waiting for a new tool, so we could start learning immediately.',
    result:
      'Time to independent work fell from about six weeks to about three, and the checklist was adopted by two neighbouring departments.',
    followUpQuestions: [
      'How did you persuade volunteers to join the buddy rota?',
      'How did you measure "time to independent work"?',
    ],
    usefulPhrases: [
      'Nobody owned this, so I stepped in.',
      'I started small so we could learn quickly.',
      'The impact went beyond my own team.',
    ],
  },
  {
    title: 'Handling an unhappy customer escalation',
    competency: 'Customer focus',
    headline:
      'I turned an escalation from a frustrated customer into a renewed contract by listening first and fixing the underlying process.',
    situation:
      'At a fictional subscription business, a long-standing customer ("Customer A") escalated to senior management after three missed support deadlines in one month.',
    task:
      'I was asked to own the relationship, calm the situation and make sure the problem would not happen again.',
    personalActions: [
      'Called the customer the same day and mainly listened.',
      'Agreed on a written recovery plan with dates we could actually meet.',
      'Found the root cause: tickets were assigned to a queue nobody monitored at weekends.',
      'Worked with the support lead to add weekend coverage and an alert.',
    ],
    decisionOrTradeoff:
      'I offered a smaller service credit than the customer first asked for, but paired it with concrete process changes they could verify.',
    result:
      'All recovery dates were met, the customer renewed for another year, and missed deadlines across all customers dropped noticeably the next quarter.',
    followUpQuestions: [
      'How did you handle the conversation about the service credit?',
      'What did you do to make sure the fix lasted?',
    ],
    usefulPhrases: [
      'My priority was to listen before I tried to solve anything.',
      'We fixed the root cause, not just the symptom.',
      'As a result, …',
    ],
  },
];
