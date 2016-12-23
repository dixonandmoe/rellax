SRC := rellax.js
TARGET := rellax.min.js

build: jshint
	@curl -s \
			 -d compilation_level=SIMPLE_OPTIMIZATIONS \
			 -d output_format=text \
			 -d output_info=compiled_code \
			 --data-urlencode "js_code@${SRC}" \
			 http://closure-compiler.appspot.com/compile \
			 > ${TARGET}

jshint: check
	@jshint ${SRC}

check:
	@type jshint >/dev/null 2>&1 || echo 'Waring: missing jshint!'
