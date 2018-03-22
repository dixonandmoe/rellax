# RELLAX

Rellax is a buttery smooth, super lightweight (1021bytes gzipped), vanilla javascript parallax library. **Update:** Rellax now works on mobile (v1.0.0).

* [Demo Website](https://dixonandmoe.com/rellax/)

Have any suggestions or feedback? Reach out [@dixonandmoe](https://twitter.com/dixonandmoe)

## Getting Started
`npm install rellax --save` or if you're old school like us download and insert `rellax.min.js`

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

<script src="rellax.min.js"></script>
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
    round: true,
    vertical: true,
    horizontal: false
  });
</script>
```
## Features

### Speed
Use the `data-rellax-speed` attribute to set the speed of a `.rellax` element to something other than the default value (which is `-2`). A negative value will make it move slower than regular scrolling, and a positive value will make it move faster. We recommend keeping the speed between `-10` and `10`.

### Centering
After some fantastic work from [@p-realinho](https://github.com/p-realinho), we just released the ability to center parallax elements in your viewport! We'll be building a nice demo website, but for now check out the tests folder for several examples of how it works.

There's two ways to implement centering, either on specific elements or as a global option.
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
- [Microsoft Fluent](https://fluent.microsoft.com/)
- [Gucci Gift](http://gift.gucci.com/)
- [Finch](https://finch.io/)
- [Product Designer in San Francisco](https://moeamaya.com/)
- [EthWorks](http://ethworks.io/)
- [Airgora](https://www.airgora.com/competition)
- [Lorem Ipsum Generator](https://loremipsumgenerator.com/)
- [Alex Bailon Portfolio](http://www.iambailon.com/)
- [Terry Design](http://terrydesign.co.uk/)
- [The Rixey](http://www.livetherixey.com/)
- [Laws of UX](https://lawsofux.com/)
- [Deeson](https://www.deeson.co.uk/)

Learn Rellax and other web animation skills with a course on [CSS Animation Rocks](http://courses.cssanimation.rocks/p/level-up)

## Development
In the spirit of lightweight javascript, the build processes (thus far) is lightweight also.

1. Open demo.html
2. Make code changes and refresh browser
3. Once feature is finished or bug fixed, use [jshint](http://jshint.com/) to lint code
4. Fix lint issues then use [Google Closure Compiler](https://closure-compiler.appspot.com/home) to minify
5. 🍻
