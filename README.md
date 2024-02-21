# RELLAX

[![NPM Package](https://img.shields.io/npm/v/rellax.svg)](https://www.npmjs.org/package/rellax)
[![Minified Size](https://img.shields.io/bundlephobia/min/rellax.svg?label=minified)](https://bundlephobia.com/result?p=rellax)
[![Gzipped Size](https://img.shields.io/bundlephobia/minzip/rellax.svg?label=gzipped)](https://bundlephobia.com/result?p=rellax)

Rellax is a buttery smooth, super lightweight, vanilla javascript parallax library. **Update:** Rellax now works on mobile (v1.0.0).

* [Demo Website](https://dixonandmoe.com/rellax/)


## Getting Started
### Using npm

`npm install rellax --save`

### Using yarn

`yarn add rellax`

### CDN

`<script src="https://cdn.jsdelivr.net/gh/dixonandmoe/rellax@master/rellax.min.js"></script>`

### Download Locally

if you're old school like us download and insert `rellax.min.js` in your html


```html
<div class="rellax">
  I’m that default chill speed of "-2"
</div>
<div class="rellax" data-rellax-speed="7">
  I’m super fast!!
</div>
<div class="rellax" data-rellax-speed="-4">
  I’m extra slow and smooth
</div>

<script src="https://cdn.jsdelivr.net/gh/dixonandmoe/rellax@master/rellax.min.js"></script>
<script>
  // Accepts any class name
  var rellax = new Rellax('.rellax');
</script>
```
```html
<script>
  // Also can pass in optional settings block
  var rellax = new Rellax('.rellax', {
    speed: -2,
    center: false,
    wrapper: null,
    round: true,
    vertical: true,
    horizontal: false
  });
</script>
```
## Features

### Speed
Use the `data-rellax-speed` attribute to set the speed of a `.rellax` element to something other than the default value (which is `-2`). A negative value will make it move slower than regular scrolling, and a positive value will make it move faster. We recommend keeping the speed between `-10` and `10`.

#### Responsive Speed
Use responsive speed attributes for breakpoint levels that require a different speed. Defaults to the `data-rellax-speed` setting in unspecified breakpoints.
```html
<div class="rellax" data-rellax-speed="7" data-rellax-xs-speed="-5" data-rellax-mobile-speed="3" data-rellax-tablet-speed="-8" data-rellax-desktop-speed="1">
  I parallax at all different speeds depending on your screen width.
</div>
```

Pass an array of breakpoints. Each breakpoint value represents the resolution for mobile, tablet, desktop respectively. Checkout the responsiveness of the [`demo`](https://dixonandmoe.com/rellax/)
```html
<script>
  // This is the default setting
  var rellax = new Rellax('.rellax', {
    breakpoints: [576, 768, 1201]
  });
</script>
```


### Centering
After some fantastic work from [@p-realinho](https://github.com/p-realinho), we just released the ability to center parallax elements in your viewport! We'll be building a nice demo website, but for now check out the tests folder for several examples of how it works.

There's two ways to implement centering, either on specific elements or as a global option.
1. #### Element-wise Centering
- Add the ```data-rellax-percentage="0.5"``` to a specific html element
```html
<div class="rellax" data-rellax-percentage="0.5">
  I’m that default chill speed of "-2" and "centered"
</div>
<div class="rellax" data-rellax-speed="7" data-rellax-percentage="0.5">
  I’m super fast!! And super centered!!
</div>
<div class="rellax" data-rellax-speed="-4" data-rellax-percentage="0.5">
  I’m extra slow and smooth, and hella centered.
</div>
```
2. #### Global Centering
- To activate the center feature in your whole html, add the code your `<script>` tag or JS file:
```html
<script>
  // Center all the things!
  var rellax = new Rellax('.rellax', {
    center: true
  });
</script>
```

### Z-index
If you want to sort your elements properly in the Z space, you can use the data-rellax-zindex property
```html
<div class="rellax">
  I’m that default chill speed of "-2" and default z-index of 0
</div>
<div class="rellax" data-rellax-speed="7" data-rellax-zindex="5">
  I’m super fast!! And on top of the previous element, I'm z-index 5!!
</div>
```

### Horizontal Parallax
Horizontal parallax is disabled by default. You can enable it by passing `horizontal: true` in the settings block.
This feature is intended for panoramic style websites, where users scroll horizontally instead of vertically.
Note that this can work together at the same time with the default vertical parallax. If you do not want this, pass `vertical: false` in the settings block.
```html
<script>
  // Adding horizantal parallax scrolling
  var rellax = new Rellax('.rellax', {
    // Activate horizantal scrolling
    // Turned off by default
    horizontal: true
    //Deactivate vertical scrolling
    vertical: false
  });
</script>
```

### Custom Wrapper
By default, the position of parallax elements is determined via the scroll position of the body. Passing in the `wrapper` property will tell Rellax to watch that element instead.
```html
<script>
  // Set wrapper to .custom-element instead of the body
  var rellax = new Rellax('.rellax', {
    wrapper: '.custom-element'
  });
</script>
```

### Refresh
```html
<script>
  // Start Rellax
  var rellax = new Rellax('.rellax');

  // Destroy and create again parallax with previous settings
  rellax.refresh();
</script>
```

### Destroy
```html
<script>
  // Start Rellax
  var rellax = new Rellax('.rellax');

  // End Rellax and reset parallax elements to their original positions
  rellax.destroy();
</script>
```

### Callback
```html
<script>
  // Start Rellax
  var rellax = new Rellax('.rellax-blur-card', {
    callback: function(positions) {
      // callback every position change
      console.log(positions);
    }
  });
</script>
```

### Target node
Instead of using a className you can use a node, handy when using React and you want to use `refs` instead of `className`.
```jsx
<div ref={ref => { this.rellaxRef = ref }}>
  I’m that default chill speed of "-2"
</div>

var rellax = new Rellax(this.rellaxRef)
```

## In the Wild
If you're using Rellax in production, we'd love to list you here! Let us know: moe@dixonandmoe.com
- [Bowmore Scotch](https://www.bowmore.com/)
- [Generated Photos](https://generated.photos/)
- [How Much Does a Website Cost](https://designagency.io/)
- [Linux Man Pages](https://dashdash.io/)
- [Laws of UX](https://lawsofux.com/)
- [Finch](https://finch.io/)
- [Embedded Payroll](https://robotist.com/embedded-payroll-api)
- [Product Designer in San Francisco](https://moeamaya.com/)
- [EthWorks](http://ethworks.io/)
- [Lorem Ipsum Generator](https://loremipsumgenerator.com/)
- [Deeson](https://www.deeson.co.uk/)

## Development
In the spirit of lightweight javascript, the build processes (thus far) is lightweight also.

1. Open demo.html
2. Make code changes and refresh browser
3. Once feature is finished or bug fixed, use [jshint](http://jshint.com/) to lint code
4. Fix lint issues then use [Google Closure Compiler](https://closure-compiler.appspot.com/home) to minify
5. 🍻

## Changelog
- 1.7.1: Remove animation on destory [PR](https://github.com/dixonandmoe/rellax/pull/132)
- 1.7.0: Scroll position set relative to the wrapper [PR](https://github.com/dixonandmoe/rellax/pull/125)
