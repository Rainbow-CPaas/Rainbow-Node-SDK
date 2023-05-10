all: build doc

allsts: build docsts

alllts: build doclts

build:
	yarn && \
	grunt ts && \
	grunt && \
	grunt delivery

doc:
	grunt nodesheets
	mkdir -p doc/sdk/node/cheatsheets
	cp bin/jsdoc/sheets/cheatsheet/node/nodeSheet.png doc/sdk/node/cheatsheets && \
	mkdir -p doc/sdk/node/api && \
	cp build/*.md doc/sdk/node/api && \
	cp build/*.xml doc/sdk/node/api && \
	mkdir -p doc/sdk/node/guides && \
	cp tutorials/*.md doc/sdk/node/guides && \
	grunt generatemermaid
	mkdir -p doc/sdk/node/imgs && \
	cp build/resources/. doc/sdk/node/imgs && \
	cp index.yml doc/sdk/node && \
	cp sitemap.xml doc/sdk/node

docsts:
	grunt nodesheets
	mkdir -p doc/sdk/node/sts/cheatsheets && \
	cp bin/jsdoc/sheets/cheatsheet/node/nodeSheet.png doc/sdk/node/sts/cheatsheets && \
	mkdir -p doc/sdk/node/sts/api && \
	cp build/*.md doc/sdk/node/sts/api && \
	cp build/*.xml doc/sdk/node/sts/api && \
	mkdir -p doc/sdk/node/sts/guides && \
	cp tutorials/*.md doc/sdk/node/sts/guides && \
	mkdir ./build/resources/
	grunt generatemermaid
	ls ./build/resources/
	mkdir -p doc/sdk/node/sts/imgs && \
	cp -r ./build/resources/. doc/sdk/node/sts/imgs && \
	cp index.yml doc/sdk/node/sts && \
	cp lts_version.json doc/sdk/node/sts && \
	cp sitemap.xml doc/sdk/node/sts
	# md files index.yml and sitemap.xml must be updated in the jenkins pipeline to update path from doc/sdk/node to doc/sdk/node/sts in theirs contents.  

doclts:
	grunt nodesheets
	mkdir -p doc/sdk/node/lts/cheatsheets && \
	cp bin/jsdoc/sheets/cheatsheet/node/nodeSheet.png doc/sdk/node/lts/cheatsheets && \
	mkdir -p doc/sdk/node/lts/api && \
	cp build/*.md doc/sdk/node/lts/api && \
	cp build/*.xml doc/sdk/node/lts/api && \
	mkdir -p doc/sdk/node/lts/guides && \
	cp tutorials/*.md doc/sdk/node/lts/guides && \
	grunt generatemermaid
	mkdir -p doc/sdk/node/lts/imgs && \
	cp build/resources/. doc/sdk/node/lts/imgs && \
	cp index.yml doc/sdk/node/lts && \
	cp lts_version.json doc/sdk/node/lts && \
	cp sitemap.xml doc/sdk/node/lts  

#	cp build/*.xml doc/sdk/node/guides
