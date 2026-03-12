const msg = chrome.i18n.getMessage;

document.getElementById('subtitle').textContent = msg('onboardingSubtitle');
document.getElementById('cta').textContent = msg('onboardingCta');
document.getElementById('footer').textContent = msg('onboardingFooter');

// Build steps with bold spans via DOM (no innerHTML)
function buildStep(id, beforeBold, bold, afterBold) {
  const el = document.getElementById(id);
  if (beforeBold) el.appendChild(document.createTextNode(beforeBold));
  const b = document.createElement('span');
  b.className = 'step-bold';
  b.textContent = bold;
  el.appendChild(b);
  if (afterBold) el.appendChild(document.createTextNode(afterBold));
}

buildStep('step1', msg('onboardingStep1a'), msg('onboardingStep1b'), msg('onboardingStep1c'));
buildStep('step2', msg('onboardingStep2a'), msg('onboardingStep2b'), msg('onboardingStep2c'));
buildStep('step3', msg('onboardingStep3a'), msg('onboardingStep3b'), msg('onboardingStep3c'));
