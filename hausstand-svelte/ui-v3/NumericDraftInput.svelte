<script>
  // Keep the user's text independently of parsed values and preview updates.
  export let value = 0;
  export let parse;
  export let onValue;
  export let label;
  export let description = undefined;
  export let disabled = false;
  export let hidden = false;
  export let inputClass = '';
  export let display = n => n == null || !Number.isFinite(n) ? '' : String(n);
  let lastValue = value;
  let raw = display(value);
  function sync(next) {
    if (!Object.is(next,lastValue)) {
      lastValue = next;
      raw = display(next);
    }
  }
  $: sync(value);
  function change(event) {
    raw = event.currentTarget.value;
    lastValue = parse(raw);
    onValue(lastValue);
  }
</script>
<input class={inputClass} type="text" inputmode="decimal" autocomplete="off"
  aria-label={label} aria-description={description} aria-invalid={!Number.isFinite(lastValue) || lastValue < 0} {disabled} {hidden} value={raw}
  on:focus={event=>{if(raw==='0')event.currentTarget.select();}} on:input={change} />
