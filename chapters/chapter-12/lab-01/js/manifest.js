/*
 * Lab manifest — the single source of truth for navigation.
 *
 * To add or reorder a module, edit `parts` below. The tab bar, progress
 * indicator, overview cards and previous/next links on every page are all
 * generated from this list, so no page needs hand-edited navigation.
 *
 * status: 'ready'   → fully interactive module
 *         'planned' → page exists with learning goals; simulation in development
 * href is relative to the lab root (chapters/chapter-12/lab-01/).
 */
window.NeuroLab = window.NeuroLab || {};
window.NeuroLab.manifest = {
  lab: {
    chapter: 12,
    number: 1,
    title: 'Nerve Impulses: From Synapse to Axon',
    tagline: 'Follow one signal from neurotransmitter release to action potential conduction.'
  },
  parts: [
    {
      id: 'overview',
      label: 'Overview',
      title: 'The journey of a nerve signal',
      href: 'index.html',
      status: 'ready'
    },
    {
      id: 'synapse',
      step: 1,
      label: 'Synaptic transmission',
      title: 'Synaptic transmission & initiating the impulse',
      href: 'synaptic-transmission/index.html',
      status: 'ready',
      summary: 'Watch Ca²⁺ trigger neurotransmitter release, receptors open, and EPSPs or IPSPs sum at the axon hillock until threshold starts an action potential. Includes a neurotransmitter guide.',
      topics: ['Ca²⁺-triggered release', 'Ligand-gated channels', 'EPSP & IPSP', 'Summation', 'Neurotransmitter guide']
    },
    {
      id: 'unmyelinated',
      step: 2,
      label: 'Unmyelinated axon',
      title: 'Continuous conduction in an unmyelinated axon',
      href: 'unmyelinated-axon/index.html',
      status: 'ready',
      summary: 'Watch voltage-gated Na⁺ and K⁺ channels open, inactivate and recover as the action potential regenerates patch by patch along the membrane.',
      topics: ['Na⁺ influx & K⁺ efflux', 'Channel gating', 'Local current', 'Refractory periods']
    },
    {
      id: 'myelinated',
      step: 3,
      label: 'Myelinated axon',
      title: 'Saltatory conduction in a myelinated axon',
      href: 'myelinated-axon/index.html',
      status: 'ready',
      summary: 'Myelin insulates the internodes, so the action potential is regenerated only at nodes of Ranvier — faster conduction with less ion exchange.',
      topics: ['Nodes of Ranvier', 'Internodal current', 'Conduction velocity', 'Demyelination']
    }
  ]
};
