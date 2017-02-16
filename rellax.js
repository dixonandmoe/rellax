
// ------------------------------------------
// Rellax.js - v1.0.0
// Buttery smooth parallax library
// Copyright (c) 2016 Moe Amaya (@moeamaya)
// MIT license
//
// Thanks to Paraxify.js and Jaime Cabllero
// for parallax concepts
// ------------------------------------------

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require('jquery'));
    } else {
        // Browser globals (root is window)
        root.Rellax = factory(root.jQuery);
    }
}(this, function ($) {
    var Rellax = function(el, options){
        "use strict";

        var self = Object.create(Rellax.prototype);

        var posY = 0; // set it to -1 so the animate function gets called at least once
        var screenY = 0;
        var blocks = [];
        var pause = false;

        var TYPE_MOVE = 2;
        var TYPE_OPACITY = 1;
        var TYPE_DELAY = 3;

        // check what requestAnimationFrame to use, and if
        // it's not supported, use the onscroll event
        var loop = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        function(callback){ setTimeout(callback, 1000 / 60); };

        // check which transform property to use
        var transformProp = window.transformProp || (function(){
            var testEl = document.createElement('div');
            if (testEl.style.transform == null) {
                var vendors = ['Webkit', 'Moz', 'ms'];
                for (var vendor in vendors) {
                    if (testEl.style[ vendors[vendor] + 'Transform' ] !== undefined) {
                        return vendors[vendor] + 'Transform';
                    }
                }
            }
            return 'transform';
        })();

        // limit the given number in the range [min, max]
        var clamp = function(num, min, max) {
            return (num <= min) ? min : ((num >= max) ? max : num);
        };

        // Default Settings
        self.options = {
            round: true,
            offset: false,
            contextClass: '.showcase-canvas',
            unit: 750,
        };

        // User defined options (might have more in the future)
        if (options) {
            Object.keys(options).forEach(function(key) {
                self.options[key] = options[key];
            });
        }

        // If some clown tries to crank speed, limit them to +-10
        self.options.speed = clamp(self.options.speed, -10, 10);

        // By default, rellax class
        if (!el) {
            el = '.rellax';
        }

        var elements = $(el);

        self.$elems = elements;
        self.blocks = blocks;

        // Let's kick this script off
        // Build array for cached element values
        // Bind scroll and resize to animate method
        var init = function() {
            screenY = window.innerHeight;
            setPosition();

            // Get and cache initial position of all elements
            self.$elems.each(function() {
                var block = createBlock(this);

                block.parallax = decorateWithParallax(block);
                block.animations = decorateWithAnimations(block);

                blocks.push(block);
            });

            window.addEventListener('resize', function(){
                animate();
            });

            // Start the loop
            update();

            // The loop does nothing if the scrollPosition did not change
            // so call animate to make sure every element has their transforms
            animate();
        };

        var decorateWithParallax = function(block) {
            var dataSpeed = block.$el.data('rellax-speed');

            if(!dataSpeed) {
                return null;
            }

            var speed = clamp(dataSpeed, -10, 10);
            var base = updatePosition(0.5, speed);

            block.$el.data('base', base);

            var offset = 0;
            if(block.$el.data('offset') || self.options.offset) {
                offset = Math.abs(base);
            }

            return {
                base: base,
                speed: speed,
                offset: offset,
            }
        }

        var moveAnimation = function(animation, value, axis) {
            var values = {x: 0, y: 0};

            values[axis] = value;

            animation.values = values;
            animation.type = TYPE_MOVE;

            return animation;
        }

        var axis = function(direction) {
            switch (direction) {
                case 'top':
                case 'bottom':
                    return 'y';
                case 'left':
                case 'right':
                    return 'x';
            }
        }

        var decorateWithAnimations = function(block) {
            var animations = [];

            var unparsedAnimations = block.$el.data('animate');
            if(!unparsedAnimations) {
                return;
            }

            unparsedAnimations = unparsedAnimations.split('|');

            var durationStart = 0;

            for(var i = 0; i < unparsedAnimations.length; i++) {
                var bits = unparsedAnimations[i].split(',');

                var animationType = bits[0];
                var durationInUnits = parseFloat(bits[1]);

                var horizontalMove = block.context.$el.width();
                var verticalMove = block.context.$el.height();

                var animation = {};

                switch(animationType) {
                    case 'move_in':
                        var direction = bits[2];

                        animation.reverse = true;
                    case 'move_out':
                        var direction = bits[2];

                        switch(direction) {
                            case 'left':
                                animation = moveAnimation(animation, -horizontalMove, axis(direction));
                                break;
                            case 'right':
                                animation = moveAnimation(animation, horizontalMove, axis(direction));
                                break;
                            case 'top':
                                animation = moveAnimation(animation, -verticalMove, axis(direction));
                                break;
                            case 'bottom':
                                animation = moveAnimation(animation, verticalMove, axis(direction));
                                break;
                        }

                        break;

                    case 'fade_out':
                        animation.reverse = true;

                    case 'fade_in':
                        animation.type = TYPE_OPACITY;
                        break;

                    case 'delay':
                        animation.type = TYPE_DELAY;
                        break;
                }

                animation.start = block.context.percent0 + (self.options.unit * durationStart);
                animation.length = (self.options.unit * durationInUnits);
                animation.stop = animation.start + animation.length;

                durationStart += durationInUnits;

                if(animation.type) {
                    animations.push(animation);
                }
            }

            return animations;
        }

        // We want to cache the parallax blocks'
        // values: base, top, height, speed
        // el: is dom object, return: el cache values
        var createBlock = function(el) {
            var $el = $(el);

            // get canvas as the context element for each layer/parallax item
            var $context = $el.is(self.options.contextClass) ? $el : $el.closest(self.options.contextClass);
            var context = $context.get(0);

            var posY = (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop);

            var contextPercent0 = posY + el.getBoundingClientRect().top;
            var contextHeight = $context.height();
            var contextPercent100 = contextPercent0 + contextHeight;

            var blockRect = el.getBoundingClientRect();

            var blockTop = blockRect.top;
            var blockLeft = blockRect.left;
            var blockHeight = $el.height();
            var blockWidth = $el.width();

            // ~~Store non-translate3d transforms~~
            // Store inline styles and extract transforms
            var style = el.style.cssText;
            var transform = '';

            // Check if there's an inline styled transform
            if (style.indexOf('transform') >= 0) {
                // Get the index of the transform
                var index = style.indexOf('transform');

                // Trim the style to the transform point and get the following semi-colon index
                var trimmedStyle = style.slice(index);
                var delimiter = trimmedStyle.indexOf(';');

                // Remove "transform" string and save the attribute
                if (delimiter) {
                    transform = " " + trimmedStyle.slice(11, delimiter).replace(/\s/g,'');
                } else {
                    transform = " " + trimmedStyle.slice(11).replace(/\s/g,'');
                }
            }

            return {
                el: el,
                $el: $el,
                currentanim: null,
                topFromViewport: blockTop,
                topAbsolute: blockTop + posY,
                leftFromViewport: blockLeft,
                width: blockWidth,
                height: blockHeight,
                context: {
                    el: context,
                    $el: $context,
                    percent0: contextPercent0,
                    percent100: contextPercent100,
                    height: contextHeight,
                },
                originalCSS: {
                    style: style,
                    transform: transform,
                },
                translate: {
                    x: 0,
                    y: 0
                }
            };
        };

        if(/Edge\/\d./i.test(navigator.userAgent)) {
            $('body').on("mousewheel", function (ev) {
                ev.preventDefault();
                var wd = ev.originalEvent.wheelDelta;
                var csp = window.pageYOffset;
                window.scrollTo(0, csp - wd);
            });
        }

        //var last20 =[];

        // set scroll position (posY)
        // side effect method is not ideal, but okay for now
        // returns true if the scroll changed, false if nothing happened
        var setPosition = function() {
            var oldY = posY;

            if (window.pageYOffset !== undefined) {
                posY = window.pageYOffset;
            } else {
                posY = (document.documentElement || document.body.parentNode || document.body).scrollTop;
            }

            if (oldY != posY) {
                // scroll changed, return true
                return true;
            }

            // scroll did not change
            return false;
        };


        // Ahh a pure function, gets new transform value
        // based on scrollPostion and speed
        // Allow for decimal pixel values
        var updatePosition = function(percentage, speed) {
            var value = (speed * (100 * (1 - percentage)));
            return self.options.round ? Math.round(value) : value;
        };


        var update = function() {
            if (setPosition() && pause === false) {
                animate();
            }

            // loop again
            loop(update);
        };

        var insideAnimation = function(animation, bottomViewportPositionAbsolute) {
            return (bottomViewportPositionAbsolute - animation.start < 0) ? -1: (bottomViewportPositionAbsolute - animation.stop > 0) ? 1: 0;
        }

        var nextFrame = function(animations, i) {
            while(animations[i] && animations[i].type == TYPE_DELAY) {
                i++;
            }

            return animations[i];
        }

        var prevFrame = function(animations, i) {
            while(animations[i] && animations[i].type == TYPE_DELAY) {
                i--;
            }

            return animations[i];
        }

        var prevOrNextFrame = function(animations, i) {
            var frame = nextFrame(animations, i);

            if(!frame) {
                frame = prevFrame(animations, i);
            }

            return frame;
        }

        // find animation frame, new currentanim and possibly percentage
        var findAnimationFrame = function(currentanim, animations, bottomViewportPositionAbsolute) {
            var newAnimationIndex = currentanim;
            var percentage = null;

            // Do this only on initialization
            if(currentanim === null) {
                if(bottomViewportPositionAbsolute - animations[0].start < 0) {
                    // Am I before the animation now? Return first animation to initialize at 0 percent and -1 index.
                    return { animation: nextFrame(animations, 0), percentage: 0, index: -1 }

                } else if(bottomViewportPositionAbsolute - animations[animations.length - 1].stop > 0) {
                    // Am I after the animation now? Return last animation to initialize at 100 percent and [animations + 1] index.
                    return { animation: prevFrame(animations, animations.length - 1), percentage: 1, index: animations.length }

                } else {
                    // Am I inside the animation now? Find the correct one and return it.
                    for(var i = 0; i < animations.length; i++) {
                        if(insideAnimation(animations[i], bottomViewportPositionAbsolute)) {
                            return { animation: prevOrNextFrame(animations, i), percentage: null, index: i }
                        }
                    }
                }
            }

            /* Get the nearest animation (or the current one if we're in the middle) */
            if(currentanim == -1) {
                newAnimationIndex = 0;
            } else if(currentanim == animations.length) {
                newAnimationIndex = currentanim - 1;
            }

            var tryAnimation = animations[newAnimationIndex];

            /* Am I inside it? */
            var step = insideAnimation(tryAnimation, bottomViewportPositionAbsolute);

            /* No. Need to find another one */
            if(step !== 0) {
                if(currentanim == -1 && step == -1) {
                    /* Do nothing, I am still before the animations */
                    return null;
                } else if(currentanim == animations.length && step == 1) {
                    /* Do nothing, I am still after the animations */
                    return null;
                } else {
                    /* I'm switching from animation with index currentanim */
                    if(currentanim == 0 && step == -1) {
                        /* I'm leaving the animation at the top */
                        return { animation: animations[0], percentage: 0, index: -1 }

                    } else if(currentanim == animations.length - 1 && step == 1) {
                        /* I'm leaving the animation th the bottom */
                        return { animation: animations[animations.length - 1], percentage: 1, index: animations.length }

                    } else {
                        /* I'm switching between two animations */
                        if(animations[currentanim + step].type == TYPE_DELAY) {
                            /* I'm on delay step, just finish the current animation */
                            return { animation: animations[currentanim], percentage: step === 1? 1: 0, index: currentanim + step }
                        }

                        /* Just start new animation */
                        return { animation: animations[currentanim + step], index: currentanim + step, percentage: null }
                    }
                }
            }

            /* Play current animation (or the first top/bottom one) */
            return { animation: tryAnimation, percentage: null, index: newAnimationIndex }
        }

        // Transform3d on parallax element
        var animate = function() {
            for (var i = 0; i < self.blocks.length; i++) {
                var block = self.blocks[i];

                // Right now parallax is exclusive with animations
                if(block.parallax) {
                    var percentage = (posY + screenY - block.context.percent0 / (block.context.height + screenY));

                    var position = updatePosition(percentage, block.parallax.speed) - block.parallax.base - block.parallax.offset - block.el.dataset.offset;

                    block.el.style[transformProp] = 'translate3d(0,' + position + 'px,0) ' + block.originalCSS.transform;
                } else if(block.animations && block.animations.length) {
                    var bottomViewportPositionAbsolute = posY + screenY;

                    // frame -> currentAnimationFrame
                    var frame = findAnimationFrame(block.currentanim, block.animations, bottomViewportPositionAbsolute);

                    //console.log('block', i, block.$el, 'frame', frame);

                    if(frame === null) {
                        continue;
                    }

                    // border case, where the only animation is a delay
                    if(!frame.animation) {
                        continue;
                    }

                    block.currentanim = frame.index;

                    if(frame.percentage === null) {
                        frame.percentage = clamp((bottomViewportPositionAbsolute - frame.animation.start) / (frame.animation.length), 0, 1);
                    }

                    switch(frame.animation.type) {
                        case TYPE_MOVE:
                            var progress = (frame.animation.reverse ? (1 - frame.percentage): frame.percentage);

                            var tx = frame.animation.values.x * progress;
                            var ty = frame.animation.values.y * progress;

                            var translate = 'translate3d(' + tx + 'px,' + ty + 'px,0) ' + block.originalCSS.transform;
                            block.el.style[transformProp] = translate;
                            break;

                        case TYPE_OPACITY:
                            block.el.style['opacity'] = (frame.animation.reverse ? (1 - frame.percentage): frame.percentage);
                            break;
                    }
                }
            }
        };

        self.animate = animate;

        self.destroy = function() {
            for (var i = 0; i < self.elems.length; i++){
                self.elems[i].style.cssText = blocks[i].style;
            }
            pause = true;
        };


        init();
        return self;
    };
    return Rellax;
}));
