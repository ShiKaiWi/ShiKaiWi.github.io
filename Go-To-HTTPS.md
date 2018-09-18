# Go To HTTPS
## Problem
Our website http://www.togetherers.com needs to be upgraded into a https website to provide secure connection for audio/video communication. 
Before starting check what we have now:
```
1. a ssl certificate and its corresponding key.
2. reverse proxy to http service via NGINX 
```

And check what we need:
```
1. add ssl configuration in NGINX
2. support ssl websocket upgrading and reverse proxy via NGINX
3. add new DNS records to make sure all possible names of website are accessible
```

## NGINX SSL Configuration
Add the `server` section  under the `http` section like this:
```
server {
	listen 443;
	// the two server_names ensure the two names of our website are accessible both
	server_name togetherers.com, www.togetherers.com;
	ssl on;
	root <your-static-files-path>;
	ssl_certificate  <your-certificate>;
	ssl_certificate_key  <your-key>;
	ssl_ciphers <your-ciphers>;
	ssl_session_timeout 5m;
	ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
	ssl_prefer_server_ciphers on;

	location / {
	}

	error_page 404 /404.html;
		location = /40x.html {
	}

	error_page 500 502 503 504 /50x.html;
		location = /50x.html {
	}
}
```

But what if user still want to access our service via http://togetherers.com ?
It needs redirection for the original http request:
```
server {
	listen 80;
	server_name togetherers.com, www.togetherers.com;
	rewrite ^(.*)$ https://$host$1 permanent;
}
```

## NGINX Websocket Reverse Proxy Configuration
We have to redirect all the websocket(with ssl) requests to the websocket service hosted in the inner network.

Add the location section below under the server section:
```
server {
	listen 443;
	...
	location /ws {
		proxy_pass http://localhost:8081;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "Upgrade";
	}
	...
}
``` 

And one important tip is that the websocket client must connect to port 443 rather than 80 when trying to connect websocket server by ssl otherwise an `ERR_SSL_PROTOCOL_ERROR` will be thrown by the web client.

## DNS problem
Actually `https://togetherers.com` cannot be accessible when all the configurations above are done. And the browser tells me an error —`DNS_PROBE_FINISHED_NXDOMAIN`.

It is obvious that my DNS records miss something so that `togetherers.com` cannot be translated into ip. Then I figures out that the root cause of this problem is that  only an `A` type DNS record tells the translation from `www.togetherers.com` to my cloud host’s ip and no record for `togetherers.com`.

The solution is easy — only a  `CNAME` record mapping togetherers.com to `www.togetherers.com` need be created.
