/* Three.js BufferGeometryUtils (r128)
The MIT License

Copyright © 2010-2021 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
( function () {

	class BufferGeometryUtils {

		static computeTangents( geometry ) {

			geometry.computeTangents();
			console.warn( 'THREE.BufferGeometryUtils: .computeTangents() has been removed. Use THREE.BufferGeometry.computeTangents() instead.' );

		}
		/**
   * @param  {Array<BufferGeometry>} geometries
   * @param  {Boolean} useGroups
   * @return {BufferGeometry}
   */


		static mergeBufferGeometries( geometries, useGroups = false ) {

			const isIndexed = geometries[ 0 ].index !== null;
			const attributesUsed = new Set( Object.keys( geometries[ 0 ].attributes ) );
			const morphAttributesUsed = new Set( Object.keys( geometries[ 0 ].morphAttributes ) );
			const attributes = {};
			const morphAttributes = {};
			const morphTargetsRelative = geometries[ 0 ].morphTargetsRelative;
			const mergedGeometry = new THREE.BufferGeometry();
			let offset = 0;

			for ( let i = 0; i < geometries.length; ++ i ) {

				const geometry = geometries[ i ];
				let attributesCount = 0; // ensure that all geometries are indexed, or none

				if ( isIndexed !== ( geometry.index !== null ) ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.' );
					return null;

				} // gather attributes, exit early if they're different


				for ( const name in geometry.attributes ) {

					if ( ! attributesUsed.has( name ) ) {

						console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.' );
						return null;

					}

					if ( attributes[ name ] === undefined ) attributes[ name ] = [];
					attributes[ name ].push( geometry.attributes[ name ] );
					attributesCount ++;

				} // ensure geometries have the same number of attributes


				if ( attributesCount !== attributesUsed.size ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. Make sure all geometries have the same number of attributes.' );
					return null;

				} // gather morph attributes, exit early if they're different


				if ( morphTargetsRelative !== geometry.morphTargetsRelative ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. .morphTargetsRelative must be consistent throughout all geometries.' );
					return null;

				}

				for ( const name in geometry.morphAttributes ) {

					if ( ! morphAttributesUsed.has( name ) ) {

						console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '.  .morphAttributes must be consistent throughout all geometries.' );
						return null;

					}

					if ( morphAttributes[ name ] === undefined ) morphAttributes[ name ] = [];
					morphAttributes[ name ].push( geometry.morphAttributes[ name ] );

				} // gather .userData


				mergedGeometry.userData.mergedUserData = mergedGeometry.userData.mergedUserData || [];
				mergedGeometry.userData.mergedUserData.push( geometry.userData );

				if ( useGroups ) {

					let count;

					if ( isIndexed ) {

						count = geometry.index.count;

					} else if ( geometry.attributes.position !== undefined ) {

						count = geometry.attributes.position.count;

					} else {

						console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. The geometry must have either an index or a position attribute' );
						return null;

					}

					mergedGeometry.addGroup( offset, count, i );
					offset += count;

				}

			} // merge indices


			if ( isIndexed ) {

				let indexOffset = 0;
				const mergedIndex = [];

				for ( let i = 0; i < geometries.length; ++ i ) {

					const index = geometries[ i ].index;

					for ( let j = 0; j < index.count; ++ j ) {

						mergedIndex.push( index.getX( j ) + indexOffset );

					}

					indexOffset += geometries[ i ].attributes.position.count;

				}

				mergedGeometry.setIndex( mergedIndex );

			} // merge attributes


			for ( const name in attributes ) {

				const mergedAttribute = this.mergeBufferAttributes( attributes[ name ] );

				if ( ! mergedAttribute ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed while trying to merge the ' + name + ' attribute.' );
					return null;

				}

				mergedGeometry.setAttribute( name, mergedAttribute );

			} // merge morph attributes


			for ( const name in morphAttributes ) {

				const numMorphTargets = morphAttributes[ name ][ 0 ].length;
				if ( numMorphTargets === 0 ) break;
				mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
				mergedGeometry.morphAttributes[ name ] = [];

				for ( let i = 0; i < numMorphTargets; ++ i ) {

					const morphAttributesToMerge = [];

					for ( let j = 0; j < morphAttributes[ name ].length; ++ j ) {

						morphAttributesToMerge.push( morphAttributes[ name ][ j ][ i ] );

					}

					const mergedMorphAttribute = this.mergeBufferAttributes( morphAttributesToMerge );

					if ( ! mergedMorphAttribute ) {

						console.error( 'THREE.BufferGeometryUtils: .mergeBufferGeometries() failed while trying to merge the ' + name + ' morphAttribute.' );
						return null;

					}

					mergedGeometry.morphAttributes[ name ].push( mergedMorphAttribute );

				}

			}

			return mergedGeometry;

		}
		/**
   * @param {Array<BufferAttribute>} attributes
   * @return {BufferAttribute}
   */


		static mergeBufferAttributes( attributes ) {

			let TypedArray;
			let itemSize;
			let normalized;
			let arrayLength = 0;

			for ( let i = 0; i < attributes.length; ++ i ) {

				const attribute = attributes[ i ];

				if ( attribute.isInterleavedBufferAttribute ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. InterleavedBufferAttributes are not supported.' );
					return null;

				}

				if ( TypedArray === undefined ) TypedArray = attribute.array.constructor;

				if ( TypedArray !== attribute.array.constructor ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. THREE.BufferAttribute.array must be of consistent array types across matching attributes.' );
					return null;

				}

				if ( itemSize === undefined ) itemSize = attribute.itemSize;

				if ( itemSize !== attribute.itemSize ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. THREE.BufferAttribute.itemSize must be consistent across matching attributes.' );
					return null;

				}

				if ( normalized === undefined ) normalized = attribute.normalized;

				if ( normalized !== attribute.normalized ) {

					console.error( 'THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. THREE.BufferAttribute.normalized must be consistent across matching attributes.' );
					return null;

				}

				arrayLength += attribute.array.length;

			}

			const array = new TypedArray( arrayLength );
			let offset = 0;

			for ( let i = 0; i < attributes.length; ++ i ) {

				array.set( attributes[ i ].array, offset );
				offset += attributes[ i ].array.length;

			}

			return new THREE.BufferAttribute( array, itemSize, normalized );

		}
		/**
   * @param {Array<BufferAttribute>} attributes
   * @return {Array<InterleavedBufferAttribute>}
   */


		static interleaveAttributes( attributes ) {

			// Interleaves the provided attributes into an THREE.InterleavedBuffer and returns
			// a set of InterleavedBufferAttributes for each attribute
			let TypedArray;
			let arrayLength = 0;
			let stride = 0; // calculate the the length and type of the interleavedBuffer

			for ( let i = 0, l = attributes.length; i < l; ++ i ) {

				const attribute = attributes[ i ];
				if ( TypedArray === undefined ) TypedArray = attribute.array.constructor;

				if ( TypedArray !== attribute.array.constructor ) {

					console.error( 'AttributeBuffers of different types cannot be interleaved' );
					return null;

				}

				arrayLength += attribute.array.length;
				stride += attribute.itemSize;

			} // Create the set of buffer attributes


			const interleavedBuffer = new THREE.InterleavedBuffer( new TypedArray( arrayLength ), stride );
			let offset = 0;
			const res = [];
			const getters = [ 'getX', 'getY', 'getZ', 'getW' ];
			const setters = [ 'setX', 'setY', 'setZ', 'setW' ];

			for ( let j = 0, l = attributes.length; j < l; j ++ ) {

				const attribute = attributes[ j ];
				const itemSize = attribute.itemSize;
				const count = attribute.count;
				const iba = new THREE.InterleavedBufferAttribute( interleavedBuffer, itemSize, offset, attribute.normalized );
				res.push( iba );
				offset += itemSize; // Move the data for each attribute into the new interleavedBuffer
				// at the appropriate offset

				for ( let c = 0; c < count; c ++ ) {

					for ( let k = 0; k < itemSize; k ++ ) {

						iba[ setters[ k ] ]( c, attribute[ getters[ k ] ]( c ) );

					}

				}

			}

			return res;

		}
		/**
   * @param {Array<BufferGeometry>} geometry
   * @return {number}
   */


		static estimateBytesUsed( geometry ) {

			// Return the estimated memory used by this geometry in bytes
			// Calculate using itemSize, count, and BYTES_PER_ELEMENT to account
			// for InterleavedBufferAttributes.
			let mem = 0;

			for ( const name in geometry.attributes ) {

				const attr = geometry.getAttribute( name );
				mem += attr.count * attr.itemSize * attr.array.BYTES_PER_ELEMENT;

			}

			const indices = geometry.getIndex();
			mem += indices ? indices.count * indices.itemSize * indices.array.BYTES_PER_ELEMENT : 0;
			return mem;

		}
		/**
   * @param {BufferGeometry} geometry
   * @param {number} tolerance
   * @return {BufferGeometry>}
   */


		static mergeVertices( geometry, tolerance = 1e-4 ) {

			tolerance = Math.max( tolerance, Number.EPSILON ); // Generate an index buffer if the geometry doesn't have one, or optimize it
			// if it's already available.

			const hashToIndex = {};
			const indices = geometry.getIndex();
			const positions = geometry.getAttribute( 'position' );
			const vertexCount = indices ? indices.count : positions.count; // next value for triangle indices

			let nextIndex = 0; // attributes and new attribute arrays

			const attributeNames = Object.keys( geometry.attributes );
			const attrArrays = {};
			const morphAttrsArrays = {};
			const newIndices = [];
			const getters = [ 'getX', 'getY', 'getZ', 'getW' ]; // initialize the arrays

			for ( let i = 0, l = attributeNames.length; i < l; i ++ ) {

				const name = attributeNames[ i ];
				attrArrays[ name ] = [];
				const morphAttr = geometry.morphAttributes[ name ];

				if ( morphAttr ) {

					morphAttrsArrays[ name ] = new Array( morphAttr.length ).fill().map( () => [] );

				}

			} // convert the error tolerance to an amount of decimal places to truncate to


			const decimalShift = Math.log10( 1 / tolerance );
			const shiftMultiplier = Math.pow( 10, decimalShift );

			for ( let i = 0; i < vertexCount; i ++ ) {

				const index = indices ? indices.getX( i ) : i; // Generate a hash for the vertex attributes at the current index 'i'

				let hash = '';

				for ( let j = 0, l = attributeNames.length; j < l; j ++ ) {

					const name = attributeNames[ j ];
					const attribute = geometry.getAttribute( name );
					const itemSize = attribute.itemSize;

					for ( let k = 0; k < itemSize; k ++ ) {

						// double tilde truncates the decimal value
						hash += `${~ ~ ( attribute[ getters[ k ] ]( index ) * shiftMultiplier )},`;

					}

				} // Add another reference to the vertex if it's already
				// used by another index


				if ( hash in hashToIndex ) {

					newIndices.push( hashToIndex[ hash ] );

				} else {

					// copy data to the new index in the attribute arrays
					for ( let j = 0, l = attributeNames.length; j < l; j ++ ) {

						const name = attributeNames[ j ];
						const attribute = geometry.getAttribute( name );
						const morphAttr = geometry.morphAttributes[ name ];
						const itemSize = attribute.itemSize;
						const newarray = attrArrays[ name ];
						const newMorphArrays = morphAttrsArrays[ name ];

						for ( let k = 0; k < itemSize; k ++ ) {

							const getterFunc = getters[ k ];
							newarray.push( attribute[ getterFunc ]( index ) );

							if ( morphAttr ) {

								for ( let m = 0, ml = morphAttr.length; m < ml; m ++ ) {

									newMorphArrays[ m ].push( morphAttr[ m ][ getterFunc ]( index ) );

								}

							}

						}

					}

					hashToIndex[ hash ] = nextIndex;
					newIndices.push( nextIndex );
					nextIndex ++;

				}

			} // Generate typed arrays from new attribute arrays and update
			// the attributeBuffers


			const result = geometry.clone();

			for ( let i = 0, l = attributeNames.length; i < l; i ++ ) {

				const name = attributeNames[ i ];
				const oldAttribute = geometry.getAttribute( name );
				const buffer = new oldAttribute.array.constructor( attrArrays[ name ] );
				const attribute = new THREE.BufferAttribute( buffer, oldAttribute.itemSize, oldAttribute.normalized );
				result.setAttribute( name, attribute ); // Update the attribute arrays

				if ( name in morphAttrsArrays ) {

					for ( let j = 0; j < morphAttrsArrays[ name ].length; j ++ ) {

						const oldMorphAttribute = geometry.morphAttributes[ name ][ j ];
						const buffer = new oldMorphAttribute.array.constructor( morphAttrsArrays[ name ][ j ] );
						const morphAttribute = new THREE.BufferAttribute( buffer, oldMorphAttribute.itemSize, oldMorphAttribute.normalized );
						result.morphAttributes[ name ][ j ] = morphAttribute;

					}

				}

			} // indices


			result.setIndex( newIndices );
			return result;

		}
		/**
   * @param {BufferGeometry} geometry
   * @param {number} drawMode
   * @return {BufferGeometry>}
   */


		static toTrianglesDrawMode( geometry, drawMode ) {

			if ( drawMode === THREE.TrianglesDrawMode ) {

				console.warn( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.' );
				return geometry;

			}

			if ( drawMode === THREE.TriangleFanDrawMode || drawMode === THREE.TriangleStripDrawMode ) {

				let index = geometry.getIndex(); // generate index if not present

				if ( index === null ) {

					const indices = [];
					const position = geometry.getAttribute( 'position' );

					if ( position !== undefined ) {

						for ( let i = 0; i < position.count; i ++ ) {

							indices.push( i );

						}

						geometry.setIndex( indices );
						index = geometry.getIndex();

					} else {

						console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.' );
						return geometry;

					}

				} //


				const numberOfTriangles = index.count - 2;
				const newIndices = [];

				if ( drawMode === THREE.TriangleFanDrawMode ) {

					// gl.TRIANGLE_FAN
					for ( let i = 1; i <= numberOfTriangles; i ++ ) {

						newIndices.push( index.getX( 0 ) );
						newIndices.push( index.getX( i ) );
						newIndices.push( index.getX( i + 1 ) );

					}

				} else {

					// gl.TRIANGLE_STRIP
					for ( let i = 0; i < numberOfTriangles; i ++ ) {

						if ( i % 2 === 0 ) {

							newIndices.push( index.getX( i ) );
							newIndices.push( index.getX( i + 1 ) );
							newIndices.push( index.getX( i + 2 ) );

						} else {

							newIndices.push( index.getX( i + 2 ) );
							newIndices.push( index.getX( i + 1 ) );
							newIndices.push( index.getX( i ) );

						}

					}

				}

				if ( newIndices.length / 3 !== numberOfTriangles ) {

					console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

				} // build final geometry


				const newGeometry = geometry.clone();
				newGeometry.setIndex( newIndices );
				newGeometry.clearGroups();
				return newGeometry;

			} else {

				console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
				return geometry;

			}

		}
		/**
   * Calculates the morphed attributes of a morphed/skinned THREE.BufferGeometry.
   * Helpful for Raytracing or Decals.
   * @param {Mesh | Line | Points} object An instance of Mesh, Line or Points.
   * @return {Object} An Object with original position/normal attributes and morphed ones.
   */


		static computeMorphedAttributes( object ) {

			if ( object.geometry.isBufferGeometry !== true ) {

				console.error( 'THREE.BufferGeometryUtils: Geometry is not of type THREE.BufferGeometry.' );
				return null;

			}

			const _vA = new THREE.Vector3();

			const _vB = new THREE.Vector3();

			const _vC = new THREE.Vector3();

			const _tempA = new THREE.Vector3();

			const _tempB = new THREE.Vector3();

			const _tempC = new THREE.Vector3();

			const _morphA = new THREE.Vector3();

			const _morphB = new THREE.Vector3();

			const _morphC = new THREE.Vector3();

			function _calculateMorphedAttributeData( object, material, attribute, morphAttribute, morphTargetsRelative, a, b, c, modifiedAttributeArray ) {

				_vA.fromBufferAttribute( attribute, a );

				_vB.fromBufferAttribute( attribute, b );

				_vC.fromBufferAttribute( attribute, c );

				const morphInfluences = object.morphTargetInfluences;

				if ( material.morphTargets && morphAttribute && morphInfluences ) {

					_morphA.set( 0, 0, 0 );

					_morphB.set( 0, 0, 0 );

					_morphC.set( 0, 0, 0 );

					for ( let i = 0, il = morphAttribute.length; i < il; i ++ ) {

						const influence = morphInfluences[ i ];
						const morph = morphAttribute[ i ];
						if ( influence === 0 ) continue;

						_tempA.fromBufferAttribute( morph, a );

						_tempB.fromBufferAttribute( morph, b );

						_tempC.fromBufferAttribute( morph, c );

						if ( morphTargetsRelative ) {

							_morphA.addScaledVector( _tempA, influence );

							_morphB.addScaledVector( _tempB, influence );

							_morphC.addScaledVector( _tempC, influence );

						} else {

							_morphA.addScaledVector( _tempA.sub( _vA ), influence );

							_morphB.addScaledVector( _tempB.sub( _vB ), influence );

							_morphC.addScaledVector( _tempC.sub( _vC ), influence );

						}

					}

					_vA.add( _morphA );

					_vB.add( _morphB );

					_vC.add( _morphC );

				}

				if ( object.isSkinnedMesh ) {

					object.boneTransform( a, _vA );
					object.boneTransform( b, _vB );
					object.boneTransform( c, _vC );

				}

				modifiedAttributeArray[ a * 3 + 0 ] = _vA.x;
				modifiedAttributeArray[ a * 3 + 1 ] = _vA.y;
				modifiedAttributeArray[ a * 3 + 2 ] = _vA.z;
				modifiedAttributeArray[ b * 3 + 0 ] = _vB.x;
				modifiedAttributeArray[ b * 3 + 1 ] = _vB.y;
				modifiedAttributeArray[ b * 3 + 2 ] = _vB.z;
				modifiedAttributeArray[ c * 3 + 0 ] = _vC.x;
				modifiedAttributeArray[ c * 3 + 1 ] = _vC.y;
				modifiedAttributeArray[ c * 3 + 2 ] = _vC.z;

			}

			const geometry = object.geometry;
			const material = object.material;
			let a, b, c;
			const index = geometry.index;
			const positionAttribute = geometry.attributes.position;
			const morphPosition = geometry.morphAttributes.position;
			const morphTargetsRelative = geometry.morphTargetsRelative;
			const normalAttribute = geometry.attributes.normal;
			const morphNormal = geometry.morphAttributes.position;
			const groups = geometry.groups;
			const drawRange = geometry.drawRange;
			let i, j, il, jl;
			let group, groupMaterial;
			let start, end;
			const modifiedPosition = new Float32Array( positionAttribute.count * positionAttribute.itemSize );
			const modifiedNormal = new Float32Array( normalAttribute.count * normalAttribute.itemSize );

			if ( index !== null ) {

				// indexed buffer geometry
				if ( Array.isArray( material ) ) {

					for ( i = 0, il = groups.length; i < il; i ++ ) {

						group = groups[ i ];
						groupMaterial = material[ group.materialIndex ];
						start = Math.max( group.start, drawRange.start );
						end = Math.min( group.start + group.count, drawRange.start + drawRange.count );

						for ( j = start, jl = end; j < jl; j += 3 ) {

							a = index.getX( j );
							b = index.getX( j + 1 );
							c = index.getX( j + 2 );

							_calculateMorphedAttributeData( object, groupMaterial, positionAttribute, morphPosition, morphTargetsRelative, a, b, c, modifiedPosition );

							_calculateMorphedAttributeData( object, groupMaterial, normalAttribute, morphNormal, morphTargetsRelative, a, b, c, modifiedNormal );

						}

					}

				} else {

					start = Math.max( 0, drawRange.start );
					end = Math.min( index.count, drawRange.start + drawRange.count );

					for ( i = start, il = end; i < il; i += 3 ) {

						a = index.getX( i );
						b = index.getX( i + 1 );
						c = index.getX( i + 2 );

						_calculateMorphedAttributeData( object, material, positionAttribute, morphPosition, morphTargetsRelative, a, b, c, modifiedPosition );

						_calculateMorphedAttributeData( object, material, normalAttribute, morphNormal, morphTargetsRelative, a, b, c, modifiedNormal );

					}

				}

			} else if ( positionAttribute !== undefined ) {

				// non-indexed buffer geometry
				if ( Array.isArray( material ) ) {

					for ( i = 0, il = groups.length; i < il; i ++ ) {

						group = groups[ i ];
						groupMaterial = material[ group.materialIndex ];
						start = Math.max( group.start, drawRange.start );
						end = Math.min( group.start + group.count, drawRange.start + drawRange.count );

						for ( j = start, jl = end; j < jl; j += 3 ) {

							a = j;
							b = j + 1;
							c = j + 2;

							_calculateMorphedAttributeData( object, groupMaterial, positionAttribute, morphPosition, morphTargetsRelative, a, b, c, modifiedPosition );

							_calculateMorphedAttributeData( object, groupMaterial, normalAttribute, morphNormal, morphTargetsRelative, a, b, c, modifiedNormal );

						}

					}

				} else {

					start = Math.max( 0, drawRange.start );
					end = Math.min( positionAttribute.count, drawRange.start + drawRange.count );

					for ( i = start, il = end; i < il; i += 3 ) {

						a = i;
						b = i + 1;
						c = i + 2;

						_calculateMorphedAttributeData( object, material, positionAttribute, morphPosition, morphTargetsRelative, a, b, c, modifiedPosition );

						_calculateMorphedAttributeData( object, material, normalAttribute, morphNormal, morphTargetsRelative, a, b, c, modifiedNormal );

					}

				}

			}

			const morphedPositionAttribute = new THREE.Float32BufferAttribute( modifiedPosition, 3 );
			const morphedNormalAttribute = new THREE.Float32BufferAttribute( modifiedNormal, 3 );
			return {
				positionAttribute: positionAttribute,
				normalAttribute: normalAttribute,
				morphedPositionAttribute: morphedPositionAttribute,
				morphedNormalAttribute: morphedNormalAttribute
			};

		}

	}

	THREE.BufferGeometryUtils = BufferGeometryUtils;

} )();

window.GFACharacterModels=(()=>{
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const down = V(0,-1,0);
const material = (color, roughness=.85) => {const m=new THREE.MeshStandardMaterial({color,roughness});return m;};
function mesh(parent, geometry, mat, position=V()) {
    const m=new THREE.Mesh(geometry,mat);m.position.copy(position);m.castShadow=false;m.receiveShadow=true;parent.add(m);return m;
}
function box(parent,w,h,d,mat,x=0,y=0,z=0) {return mesh(parent,new THREE.BoxGeometry(w,h,d),mat,V(x,y,z));}
// Eight-sided cross sections retain a low-poly silhouette without square shoulders or jaws.
function shaped(parent, rings, mat) {
    const vertices=[], indices=[],uvs=[];
    rings.forEach(([y,w,d],ringIndex) => {const c=.21;[[-1+c,-1],[1-c,-1],[1,-1+c],[1,1-c],[1-c,1],[-1+c,1],[-1,1-c],[-1,-1+c]].forEach(([x,z],sideIndex)=>{vertices.push(x*w/2,y,z*d/2);uvs.push(sideIndex/7,ringIndex/Math.max(1,rings.length-1));});});
    for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++){const a=r*8+i,b=r*8+(i+1)%8,c=b+8,d=a+8;indices.push(a,d,b,b,d,c);}
    for(let i=1;i<7;i++){indices.push(0,i,i+1);const k=(rings.length-1)*8;indices.push(k,k+i+1,k+i);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,mat);
}
function pivot(parent,x=0,y=0,z=0){const p=new THREE.Group();p.position.set(x,y,z);parent.add(p);return p;}
function sphere(parent,r,mat){return mesh(parent,new THREE.SphereGeometry(r,10,8),mat);}
function limb(parent, anchor, a,b, width, upperMat, lowerMat, rootJointMat=upperMat) {
    const root=pivot(parent,...anchor), bend=pivot(root,0,-a,0), end=pivot(bend,0,-b,0);
    shaped(root,[[-a+.04,width*.73,width*.76],[-a*.48,width*.93,width*.95],[-.045,width,width]],upperMat);
    shaped(bend,[[-b+.035,width*.58,width*.66],[-b*.48,width*.75,width*.8],[-.035,width*.76,width*.83]],lowerMat);
    sphere(root,width*.43,rootJointMat);sphere(bend,width*.36,lowerMat);
    return {root,bend,end,a,b};
}
// Analytic two-bone IK keeps limb lengths fixed and uses a pole to control the elbow/knee bend.
function solve(l,target,pole) {
    const origin=l.root.position.clone(), axis=target.clone().sub(origin);
    const raw=axis.length(), distance=THREE.MathUtils.clamp(raw,Math.abs(l.a-l.b)+.0001,l.a+l.b-.0001);
    axis.normalize();
    const hint=pole.clone().sub(origin);hint.addScaledVector(axis,-hint.dot(axis));
    if(hint.lengthSq()<1e-8)hint.set(0,0,1);hint.normalize();
    const along=(l.a*l.a-l.b*l.b+distance*distance)/(2*distance);
    const elbow=origin.clone().addScaledVector(axis,along).addScaledVector(hint,Math.sqrt(Math.max(0,l.a*l.a-along*along)));
    const end=origin.clone().addScaledVector(axis,distance);
    const q1=new THREE.Quaternion().setFromUnitVectors(down,elbow.clone().sub(origin).normalize());
    const q2=new THREE.Quaternion().setFromUnitVectors(down,end.clone().sub(elbow).normalize());
    l.root.quaternion.copy(q1);l.bend.quaternion.copy(q1.clone().invert().multiply(q2));
    l.end.quaternion.copy(q2.clone().invert());
}
// Snapshot of the game's defaults plus its bundled recovery presets. No game storage is accessed.
const weaponModels={
  "pistol": {
    "body": {
      "shape": "box",
      "length": 0.6,
      "thickness": 0.08,
      "color": "#222222",
      "metalness": 0.8,
      "roughness": 0.1
    },
    "scope": {
      "enabled": false,
      "radius": 0.04,
      "length": 0.24,
      "color": "#aaaaaa",
      "posX": 0,
      "posY": 0.11,
      "posZ": 0.2
    },
    "magazine": {
      "enabled": false,
      "width": 0.08,
      "height": 0.22,
      "depth": 0.11,
      "color": "#222222",
      "posX": 0,
      "posY": -0.15,
      "posZ": 0.05
    },
    "barrel": {
      "enabled": false,
      "shape": "box",
      "width": 0.05,
      "height": 0.05,
      "depth": 0.85,
      "color": "#111111",
      "posX": 0,
      "posY": 0,
      "posZ": 0.35
    }
  },
  "machinegun": {
    "body": {
      "shape": "box",
      "length": 1.1,
      "thickness": 0.1,
      "color": "#111111",
      "metalness": 0.81,
      "roughness": 0.1
    },
    "scope": {
      "enabled": false,
      "radius": 0.04,
      "length": 0.24,
      "color": "#aaaaaa",
      "posX": 0,
      "posY": 0.11,
      "posZ": 0.2
    },
    "magazine": {
      "enabled": true,
      "width": 0.08,
      "height": 0.44,
      "depth": 0.11,
      "color": "#222222",
      "posX": 0,
      "posY": -0.26,
      "posZ": 0.05
    },
    "barrel": {
      "enabled": true,
      "shape": "cylinder",
      "width": 0.05,
      "height": 0.05,
      "depth": 1.09,
      "color": "#111111",
      "posX": 0,
      "posY": 0,
      "posZ": 0.25
    }
  },
  "rocketlauncher": {
    "body": {
      "shape": "cylinder",
      "length": 2.6,
      "thickness": 0.22,
      "color": "#6b4b1f",
      "metalness": 0.3,
      "roughness": 0.5
    },
    "scope": {
      "enabled": false,
      "radius": 0.04,
      "length": 0.24,
      "color": "#aaaaaa",
      "posX": 0,
      "posY": 0.11,
      "posZ": 0.2
    },
    "magazine": {
      "enabled": false,
      "width": 0.08,
      "height": 0.22,
      "depth": 0.11,
      "color": "#222222",
      "posX": 0,
      "posY": -0.15,
      "posZ": 0.05
    },
    "barrel": {
      "enabled": false,
      "shape": "box",
      "width": 0.05,
      "height": 0.05,
      "depth": 0.85,
      "color": "#111111",
      "posX": 0,
      "posY": 0,
      "posZ": 0.35
    }
  },
  "sniperrifle": {
    "body": {
      "shape": "box",
      "length": 1.29,
      "thickness": 0.09,
      "color": "#1d1b1b",
      "metalness": 0.3,
      "roughness": 0.5
    },
    "scope": {
      "enabled": true,
      "radius": 0.03,
      "length": 0.29,
      "color": "#2f2d2d",
      "posX": 0,
      "posY": 0.08,
      "posZ": -0.17
    },
    "magazine": {
      "enabled": true,
      "width": 0.04,
      "height": 0.12,
      "depth": 0.2,
      "color": "#222222",
      "posX": 0,
      "posY": -0.11,
      "posZ": 0.05
    },
    "barrel": {
      "enabled": true,
      "shape": "cylinder",
      "width": 0.05,
      "height": 0.05,
      "depth": 1.72,
      "color": "#111111",
      "posX": 0,
      "posY": 0,
      "posZ": 0.35
    }
  },
  "shotgun": {
    "body": {
      "shape": "box",
      "length": 1.2,
      "thickness": 0.12,
      "color": "#231f1f",
      "metalness": 0.3,
      "roughness": 0.5
    },
    "scope": {
      "enabled": false,
      "radius": 0.04,
      "length": 0.24,
      "color": "#aaaaaa",
      "posX": 0,
      "posY": 0.11,
      "posZ": 0.2
    },
    "magazine": {
      "enabled": false,
      "width": 0.08,
      "height": 0.22,
      "depth": 0.11,
      "color": "#222222",
      "posX": 0,
      "posY": -0.15,
      "posZ": 0.05
    },
    "barrel": {
      "enabled": true,
      "shape": "cylinder",
      "width": 0.08,
      "height": 0.05,
      "depth": 0.69,
      "color": "#111111",
      "posX": 0,
      "posY": 0,
      "posZ": 0.35
    }
  },
  "m1rifle": {
    "body": {
      "shape": "box",
      "length": 1.4,
      "thickness": 0.12,
      "color": "#8b4513",
      "metalness": 0.3,
      "roughness": 0.5
    },
    "scope": {
      "enabled": false,
      "radius": 0.04,
      "length": 0.24,
      "color": "#aaaaaa",
      "posX": 0,
      "posY": 0.11,
      "posZ": 0.2
    },
    "magazine": {
      "enabled": false,
      "width": 0.08,
      "height": 0.22,
      "depth": 0.11,
      "color": "#222222",
      "posX": 0,
      "posY": -0.15,
      "posZ": 0.05
    },
    "barrel": {
      "enabled": true,
      "shape": "cylinder",
      "width": 0.06,
      "height": 0.06,
      "depth": 1.05,
      "color": "#111111",
      "posX": 0,
      "posY": 0,
      "posZ": 0.49
    }
  }
};
const weaponProfiles={
    m1rifle:{label:'M1 RIFLE',position:[-.18,.91,1.06],right:[0,-.067,-.59],left:[0,-.07,-.26],head:[-.065,-.06,.12]},
    pistol:{label:'PISTOL',position:[-.02,.84,.98],right:[0,-.16,-.198],left:[.075,-.16,-.205],head:[0,0,0],rightPole:[-.55,-.15,.32],leftPole:[.55,-.15,.32]},
    machinegun:{label:'MACHINE GUN',position:[-.18,.86,.62],right:[0,-.15,-.363],left:[0,-.075,.20],head:[-.065,-.06,.12]},
    sniperrifle:{label:'SNIPER RIFLE',position:[-.18,.91,1.00],right:[0,-.063,-.53],left:[0,-.065,-.19],head:[-.075,-.04,.16]},
    shotgun:{label:'SHOTGUN',position:[-.18,.86,.66],right:[0,-.16,-.396],left:[0,-.08,.13],head:[-.065,-.06,.12]},
    rocketlauncher:{label:'ROCKET LAUNCHER',position:[-.25,.82,.78],right:[0,-.13,-.55],left:[.016,-.10,-.28],head:[.015,-.08,.04],frame:.88}
};
function weaponGeometry(parent,id,variant='A') {
    variant=['A','B','C'].includes(String(variant).toUpperCase())?String(variant).toUpperCase():'A';
    const metal=material('#424b50',.39);metal.metalness=.72;
    const steel=material('#7b8487',.32);steel.metalness=.78;
    const dark=material('#171d21',.68),rubber=material('#303632',.95);
    const woodColor=id==='m1rifle'&&variant==='B'?'#343d41':id==='m1rifle'&&variant==='C'?'#454f45':'#85532e';
    const wood=material(woodColor,.78),woodDark=material('#4e2f20',.82),olive=material('#657052',.82),glass=material('#296a77',.22);
    const gunLight=material('#68757a',.38),sand=material('#a6936d',.88),red=material('#8d332b',.72);
    const bore=material('#080c0e',1);bore.side=THREE.BackSide;
    glass.metalness=.5;
    const B=(w,h,d,m,x=0,y=0,z=0)=>box(parent,w,h,d,m,x,y,z);
    function cylinder(r,length,m,x=0,y=0,z=0,rBack=r,open=false){const g=new THREE.CylinderGeometry(r,rBack,length,12,1,open);g.rotateX(Math.PI/2);return mesh(parent,g,m,V(x,y,z));}
    function profile(points,width,m){const s=new THREE.Shape();points.forEach(([z,y],i)=>i?s.lineTo(z,y):s.moveTo(z,y));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:width,steps:1,bevelEnabled:false});g.translate(0,0,-width/2);g.rotateY(-Math.PI/2);return mesh(parent,g,m);}
    function ring(z,y,outer,inner,m,x=0){return mesh(parent,new THREE.RingGeometry(inner,outer,12),m,V(x,y,z));}
    function muzzle(z,y,r=.034,x=0){
        cylinder(r,.07,metal,x,y,z-.035,r,true);
        ring(z,y,r,r*.62,steel,x);
        cylinder(r*.63,.07,bore,x,y,z-.036,r*.63,true);
        // The recessed black disk leaves visible depth inside the open muzzle.
        mesh(parent,new THREE.CircleGeometry(r*.62,12),dark,V(x,y,z-.072));
    }
    function trigger(z,y=-.14,length=.15,height=.09){
        B(.025,.014,length,metal,0,y-height/2,z);B(.025,height,.014,metal,0,y,z+length/2);B(.025,height,.014,metal,0,y,z-length/2);
        profile([[z+.035,y+.05],[z+.018,y+.01],[z+.035,y-.025],[z+.02,y-.03],[z,y+.012],[z+.02,y+.05]],.015,dark);
    }
    function grip(z,m=rubber){profile([[z-.035,-.04],[z+.045,-.065],[z+.02,-.28],[z-.08,-.265]],.085,m);for(let i=0;i<4;i++)B(.089,.013,.067,dark,0,-.12-i*.033,z-.01-i*.004);}
    function sights(rear,front,y=.105){B(.11,.045,.07,metal,0,y,rear);B(.055,.034,.026,dark,0,y+.03,rear);B(.07,.055,.045,metal,0,y,front);B(.016,.055,.015,steel,0,y+.04,front);[-1,1].forEach(s=>B(.012,.065,.025,metal,s*.04,y+.04,front));}
    function rail(z,length,y){B(.085,.02,length,metal,0,y,z);const n=Math.max(3,Math.round(length/.065));for(let i=0;i<n;i++)B(.11,.013,.022,dark,0,y+.017,z-length/2+(i+.5)*length/n);}
    function bolt(z,y){B(.065,.025,.032,steel,-.081,y,z);const knob=mesh(parent,new THREE.SphereGeometry(.027,8,6),dark,V(-.12,y-.012,z));knob.scale.y=.78;}
    function stock(zBack,zFront,m){profile([[zBack,.035],[zBack+.07,.06],[zFront,.035],[zFront,-.07],[zBack+.18,-.15],[zBack+.02,-.245],[zBack,-.24]],.13,m);B(.15,.285,.027,rubber,0,-.105,zBack);}
    function buildArmoryVariant(){
        const q=new THREE.Group();parent.add(q);
        const vb=(z,y,x,l,h,w,m)=>mesh(q,new THREE.BoxGeometry(w,h,l),m,V(x,y,z));
        const vc=(z,y,x,r,len,m,r2=r,open=false)=>{const g=new THREE.CylinderGeometry(r,r2,len,12,1,open);g.rotateX(Math.PI/2);return mesh(q,g,m,V(x,y,z));};
        const vp=(points,width,m)=>{const s=new THREE.Shape();points.forEach(([z,y],i)=>i?s.lineTo(z,y):s.moveTo(z,y));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:width,steps:1,bevelEnabled:false});g.translate(0,0,-width/2);g.rotateY(-Math.PI/2);return mesh(q,g,m);};
        const vcone=(z,y,x,r,len,m)=>{const g=new THREE.ConeGeometry(r,len,12);g.rotateX(Math.PI/2);return mesh(q,g,m,V(x,y,z));};
        const vtrigger=()=>{};
        const vgrip=(z,y,m=rubber)=>{const g=vp([[-.08,.18],[.08,.16],[.04,-.18],[-.10,-.18]],.14,m);g.position.set(0,y,z);g.rotation.x=.16;return g;};
        const vstock=(z,y,m=rubber)=>{vp([[z-.62,y+.13],[z-.08,y+.10],[z+.02,y+.02],[z-.10,y-.10],[z-.43,y-.24],[z-.62,y-.23]],.18,m);vb(z-.61,y-.06,0,.055,.36,.20,dark);};
        const vskeleton=(z,y)=>{vb(z-.34,y+.10,0,.56,.045,.10,metal);const lower=vb(z-.34,y-.12,0,.54,.04,.10,metal);lower.rotation.x=-.28;vb(z-.62,y-.03,0,.055,.34,.15,rubber);};
        const vmuzzle=(z,y,r=.055,x=0)=>{vc(z,y,x,r,.10,metal,r,true);const rim=mesh(q,new THREE.RingGeometry(r*.62,r,12),steel,V(x,y,z+.052));rim.rotation.y=Math.PI;vc(z+.015,y,x,r*.62,.07,dark,r*.62,true);};
        const vsight=(z,y)=>{vb(z,y,0,.035,.085,.04,dark);vb(z,y+.048,0,.075,.018,.04,steel);};
        const vrail=(z,y,len)=>{vb(z,y,0,len,.025,.11,metal);const n=Math.max(3,Math.floor(len/.1));for(let i=0;i<n;i++)vb(z-len/2+(i+.5)*len/n,y+.02,0,.025,.018,.13,dark);};
        const vscope=(z,y,len=.62,r=.075)=>{vc(z,y,0,r,len,dark);vc(z+len/2-.04,y,0,r*1.25,.10,metal);vc(z-len/2+.04,y,0,r*1.12,.08,metal);[-.18,.18].forEach(d=>vb(z+d,y-.09,0,.045,.12,.055,metal));};
        const vmag=(z,y,kind='box',m=metal)=>{if(kind==='curved'){const g=vp([[z-.10,y+.14],[z+.08,y+.14],[z+.14,y-.20],[z+.02,y-.31],[z-.08,y-.22]],.14,m);g.rotation.x=.12;return;}const h=kind==='short'?.22:.34;const g=vb(z,y-h/2,0,.17,h,.13,m);if(kind==='slant')g.rotation.x=-.12;};
        const place=(rawTrigger,rawMuzzle,targetTrigger,targetMuzzle,rawY,targetY)=>{const s=(targetMuzzle-targetTrigger)/(rawMuzzle-rawTrigger);q.scale.setScalar(s);q.position.set(0,targetY-rawY*s,targetTrigger-rawTrigger*s);trigger(targetTrigger,targetY,id==='pistol'?.12:.15);};
        if(id==='pistol'){
            const slide=new THREE.Group();q.add(slide);
            const sb=(z,y,x,l,h,w,m)=>mesh(slide,new THREE.BoxGeometry(w,h,l),m,V(x,y,z));
            const sp=(points,width,m)=>{const s=new THREE.Shape();points.forEach(([z,y],i)=>i?s.lineTo(z,y):s.moveTo(z,y));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:width,steps:1,bevelEnabled:false});g.translate(0,0,-width/2);g.rotateY(-Math.PI/2);return mesh(slide,g,m);};
            const sc=(z,y,x,r,len,m)=>{const g=new THREE.CylinderGeometry(r,r,len,12);g.rotateX(Math.PI/2);return mesh(slide,g,m,V(x,y,z));};
            if(variant==='B'){
                sp([[-.72,.18],[.46,.18],[.55,.11],[.55,-.02],[-.68,-.02]],.18,metal);for(let i=0;i<5;i++)sb(-.58+i*.055,.08,.095,.018,.13,.012,dark);
                vp([[-.60,-.04],[.42,-.04],[.36,-.15],[-.38,-.16]],.145,metal);vgrip(-.42,-.31,woodDark);vtrigger(-.12,-.16);place(-.12,.73,-.065,.308,-.16,-.133);
            }else{
                sp([[-.70,.17],[.60,.17],[.60,-.04],[-.64,-.04]],.17,gunLight);[-1,1].forEach(side=>sb(.05,.105,side*.091,.60,.065,.012,dark));sb(-.49,.12,.098,.12,.035,.018,steel);for(let i=0;i<5;i++)sb(-.57+i*.055,.055,.098,.018,.075,.012,dark);
                vp([[-.58,-.04],[.46,-.04],[.38,-.14],[-.36,-.15]],.145,metal);vgrip(-.42,-.31,dark);vtrigger(-.11,-.16);place(-.11,.73,-.065,.308,-.16,-.133);
            }
            sb(.66,.055,0,.12,.086,.086,metal);slide.scale.y=-1;slide.position.y=.14;
        }else if(id==='machinegun'){
            if(variant==='B'){
                vstock(-.38,.01,wood);vp([[-.48,.16],[.25,.16],[.38,.07],[.30,-.14],[-.42,-.15]],.20,metal);vgrip(-.22,-.28,woodDark);vtrigger(-.02,-.17);vmag(.18,-.13,'curved',metal);vp([[.28,.14],[.92,.11],[1.02,.02],[.90,-.10],[.32,-.11]],.19,wood);vc(1.29,.03,0,.042,.62,metal);vmuzzle(1.61,.03,.063);vc(-.25,.03,.12,.022,.16,steel);place(-.02,1.61,-.225,.817,-.17,-.135);
            }else{
                vskeleton(-.48,.02);vb(-.18,.03,0,.72,.30,.20,metal);vgrip(-.28,-.28,dark);vtrigger(-.08,-.16);vmag(.08,-.12,'slant',dark);vp([[.19,.188],[.91,.188],[.91,.02],[.19,-.10]],.22,gunLight);vc(1.14,.13,0,.045,.58,metal);vmuzzle(1.44,.13,.065);vrail(.22,.20,1.30);vscope(.12,.34,.46,.06);place(-.08,1.44,-.225,.817,-.16,-.135);
            }
        }else if(id==='sniperrifle'){
            if(variant==='A'){
                vstock(-.48,.01,wood);vp([[-.55,.13],[.40,.13],[.52,.04],[.35,-.13],[-.42,-.14]],.20,wood);vb(-.15,.10,0,.58,.18,.17,metal);vtrigger(-.35,-.16);vc(.99,.08,0,.038,1.46,metal);vmuzzle(1.74,.08,.057);vscope(-.02,.34,.76,.075);vb(.23,.10,-.13,.05,.04,.18,steel);place(-.35,1.74,-.48,1.215,-.16,-.16);
            }else{
                vskeleton(-.72,.06);vb(-.30,.06,0,1.02,.35,.25,dark);vgrip(-.45,-.30);vtrigger(-.18,-.18);vb(.02,-.34,0,.28,.42,.18,metal);vb(.55,.06,0,.82,.30,.28,sand);vc(1.53,.08,0,.058,1.16,metal);vb(2.08,.08,0,.24,.20,.22,metal);for(let i=0;i<3;i++)vb(2+i*.08,.08,0,.028,.27,.30,dark);vmuzzle(2.22,.08,.075);vscope(-.02,.38,1.02,.09);place(-.18,2.22,-.48,1.215,-.18,-.16);
            }
        }else if(id==='shotgun'){
            if(variant==='B'){
                vstock(-.70,0,wood);vb(-.30,.03,0,.70,.29,.21,metal);vtrigger(-.36,-.16);vc(.62,.08,0,.052,1.18,metal);vmuzzle(1.23,.08,.061);vc(.50,-.04,0,.035,1.12,metal);vb(.43,0,0,.47,.22,.24,wood);for(let i=0;i<7;i++)[-1,1].forEach(side=>vb(.24+i*.065,0,side*.125,.025,.18,.012,woodDark));place(-.36,1.23,-.255,.711,-.16,-.135);
            }else{
                vstock(-.58,-.02,woodDark);vb(-.22,.03,0,.72,.27,.22,metal);vtrigger(-.34,-.16);vb(-.18,.075,.116,.25,.09,.012,dark);vc(.82,.07,.065,.048,1.62,metal);vc(.82,.07,-.065,.048,1.62,metal);vmuzzle(1.65,.07,.057,.065);vmuzzle(1.65,.07,.057,-.065);vb(.60,.025,0,.62,.21,.29,wood);place(-.34,1.65,-.255,.711,-.16,-.135);
            }
        }else if(id==='rocketlauncher'){
            if(variant==='A'){
                vc(0,.05,0,.16,2.75,olive);vc(1.34,.05,0,.21,.15,metal);vc(-1.34,.05,0,.22,.16,metal);for(let z=-.9;z<1;z+=.45)vc(z,.05,0,.18,.045,dark);vgrip(-.62,-.24);vtrigger(-.40,-.13);vb(-.10,.30,0,.34,.18,.16,metal);vscope(-.10,.47,.34,.055);place(-.40,1.34,-.45,.85,-.13,-.185);
            }else if(variant==='B'){
                vc(-.20,.02,0,.105,2.20,olive);vcone(1.12,.02,0,.30,.72,red);vc(.77,.02,0,.18,.28,red);vcone(-1.38,.02,0,.18,.42,woodDark);vc(-1.07,.02,0,.14,.35,woodDark);vgrip(-.45,-.23,woodDark);vtrigger(-.24,-.12);vb(-.42,.145,0,.24,.08,.12,metal);vsight(-.16,.145);place(-.24,1.48,-.45,.85,-.12,-.185);
            }else{
                vc(.12,.05,0,.20,2.80,sand);vc(1.47,.05,0,.27,.20,metal);vcone(-1.50,.05,0,.31,.40,metal);for(let z=-.8;z<1.15;z+=.38)vc(z,.05,0,.215,.04,olive);vgrip(-.62,-.25);vgrip(.20,-.23);vtrigger(-.42,-.14);vb(-.02,.36,0,.44,.22,.17,metal);vscope(-.02,.52,.40,.06);place(-.42,1.47,-.45,.85,-.14,-.185);
            }
        }
    }
    const useArmoryVariant=(id==='sniperrifle'&&variant==='A')||(variant!=='A'&&id!=='m1rifle'&&!(id==='sniperrifle'&&variant==='B'))||id==='rocketlauncher';
    if(useArmoryVariant){
        buildArmoryVariant();
    }else if(id==='pistol'){
        profile([[-.30,.065],[.26,.065],[.30,.035],[.30,-.035],[-.29,-.035]],.105,metal);
        profile([[-.29,-.04],[.25,-.04],[.23,-.084],[-.14,-.10],[-.22,-.06]],.086,rubber);
        grip(-.198);trigger(-.065,-.133,.15,.09);
        muzzle(.308,.01,.032);
        B(.002,.04,.095,dark,-.054,.019,.035);B(.006,.025,.06,steel,-.057,.014,.01);
        for(let i=0;i<5;i++)[-1,1].forEach(s=>B(.005,.061,.009,dark,s*.054,.023,-.263+i*.018));
        B(.075,.022,.025,dark,0,.08,-.265);B(.018,.024,.02,steel,0,.081,.253);
        B(.02,.012,.064,metal,-.053,-.058,-.17);
    }else if(id==='m1rifle'){
        profile([[-1.19,.015],[-.98,.025],[-.66,-.035],[-.45,.018],[.55,.018],[.69,-.022],[.67,-.09],[-.41,-.108],[-.64,-.14],[-.92,-.175],[-1.19,-.285]],.125,wood);
        B(.135,.30,.026,rubber,0,-.135,-1.19);
        cylinder(.028,1.40,metal,0,.026,.31);
        B(.108,.086,.41,metal,0,.038,-.285);B(.074,.027,.24,steel,0,.088,-.31);
        B(.077,.012,.14,dark,0,.105,-.27);bolt(-.24,.042);
        [.23,.59].forEach(z=>{B(.139,.11,.029,metal,0,-.035,z);});
        trigger(-.535,-.165,.18,.12);sights(-.46,.91,.09);muzzle(1.015,.026);
        B(.007,.021,.51,wood,-.068,-.052,-.92);
    }else if(id==='machinegun'){
        stock(-.68,-.29,rubber);cylinder(.03,.29,metal,0,-.014,-.41);
        profile([[-.37,.085],[.16,.085],[.25,.015],[.20,-.10],[-.26,-.12],[-.37,-.05]],.132,metal);
        grip(-.363);trigger(-.225,-.135,.17,.105);
        profile([[-.005,-.08],[.108,-.08],[.13,-.27],[.20,-.45],[.08,-.48],[.012,-.285]],.089,metal);
        B(.115,.112,.33,rubber,0,.014,.305);
        for(let i=0;i<4;i++)[-1,1].forEach(s=>B(.004,.024,.035,dark,s*.059,.025,.185+i*.074));
        cylinder(.027,.42,metal,0,.024,.595);rail(.12,.70,.094);sights(-.30,.46,.125);muzzle(.817,.024,.035);
        B(.003,.035,.13,dark,-.068,.02,-.06);bolt(-.20,.045);
    }else if(id==='sniperrifle'){
        stock(-1.15,-.53,rubber);
        profile([[-.86,.035],[-.66,.054],[-.54,.01],[-.35,.026],[.32,.015],[.34,-.086],[-.39,-.107],[-.58,-.14],[-.78,-.08]],.135,olive);
        B(.12,.045,.31,rubber,0,.061,-.92);
        cylinder(.048,.59,metal,0,.033,-.15);cylinder(.031,.97,metal,0,.03,.715);muzzle(1.215,.03,.042);
        B(.075,.16,.19,metal,0,-.135,.05);trigger(-.48,-.16,.16,.11);bolt(-.21,.04);
        [-.40,-.11].forEach(z=>{B(.075,.053,.036,metal,0,.093,z);cylinder(.057,.03,metal,0,.15,z);});
        cylinder(.046,.43,dark,0,.15,-.255);cylinder(.066,.105,dark,0,.15,-.007,.048);cylinder(.054,.07,dark,0,.15,-.5);
        ring(.048,.15,.066,.052,metal);mesh(parent,new THREE.CircleGeometry(.050,12),glass,V(0,.15,.041));
        const lens=mesh(parent,new THREE.CircleGeometry(.042,12),glass,V(0,.15,-.539));lens.rotation.y=Math.PI;
        mesh(parent,new THREE.CylinderGeometry(.028,.028,.046,10),metal,V(0,.211,-.255));
    }else if(id==='shotgun'){
        stock(-.69,-.42,rubber);grip(-.396);trigger(-.255,-.135,.17,.11);
        profile([[-.40,.075],[.025,.075],[.11,.023],[.09,-.08],[-.32,-.096],[-.40,-.02]],.14,metal);
        cylinder(.041,.66,metal,0,.025,.365);muzzle(.711,.025,.048);
        cylinder(.032,.56,metal,0,-.064,.343);cylinder(.037,.026,steel,0,-.064,.623);
        B(.145,.116,.30,rubber,0,-.055,.235);for(let i=0;i<7;i++)B(.15,.119,.012,dark,0,-.055,.102+i*.045);
        B(.003,.039,.16,dark,-.071,.014,-.155);B(.006,.016,.10,steel,-.073,-.01,-.12);
        B(.012,.035,.025,steel,0,.077,.647);B(.06,.016,.25,dark,0,.087,-.23);
    }else if(id==='rocketlauncher'){
        cylinder(.105,2.52,olive,0,0,0,.105,true);
        cylinder(.143,.13,olive,0,0,1.255,.106,true);ring(1.32,0,.143,.100,metal);
        cylinder(.10,.20,bore,0,0,1.214,.10,true);mesh(parent,new THREE.CircleGeometry(.098,12),dark,V(0,0,1.105));
        cylinder(.107,.14,olive,0,0,-1.23,.148,true);cylinder(.104,.105,bore,0,0,-1.249,.104,true);
        const backRim=ring(-1.30,0,.148,.104,metal);backRim.rotation.y=Math.PI;
        const rearDisk=mesh(parent,new THREE.CircleGeometry(.101,12),dark,V(0,0,-1.20));rearDisk.rotation.y=Math.PI;
        [-.96,-.31,.45,1.04].forEach(z=>cylinder(.114,.037,metal,0,0,z));
        B(.205,.092,.23,rubber,0,-.13,-1.145);grip(-.858);trigger(-.723,-.185,.14,.09);
        for(let i=0;i<6;i++)cylinder(.110,.012,rubber,0,0,-.58+i*.055);
        B(.035,.15,.05,metal,-.13,.075,-.59);B(.11,.075,.20,metal,-.13,.174,-.57);
        mesh(parent,new THREE.CircleGeometry(.025,10),glass,V(-.13,.174,-.467));
        B(.056,.067,.047,metal,-.075,.125,.82);B(.012,.075,.014,dark,-.075,.182,.82);
    }
    // Batch static weapon pieces by material so extra detail adds few draw calls.
    const batches=new Map();
    parent.updateMatrixWorld(true);
    const inverseParent=parent.matrixWorld.clone().invert(),pieces=[];
    parent.traverse(o=>{if(o!==parent&&o.isMesh&&o.geometry)pieces.push(o);});
    pieces.forEach(o=>{const relative=inverseParent.clone().multiply(o.matrixWorld);const source=o.geometry.clone().applyMatrix4(relative);const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(g);o.geometry.dispose();});
    parent.clear();
    batches.forEach((geometries,m)=>{const merged=THREE.BufferGeometryUtils.mergeBufferGeometries(geometries,false);if(!merged)throw new Error('Weapon geometry merge failed');geometries.forEach(g=>g.dispose());mesh(parent,merged,m);});
    [metal,steel,dark,rubber,wood,woodDark,olive,glass,bore,gunLight,sand,red].forEach(m=>{if(!batches.has(m))m.dispose();});
}
function camoTexture(type){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
    const colors=type==='camo2'?['#d8cfb5','#f0ead6','#c0aa78','#927135','#6f5526']:['#34451f','#1d2615','#596a35','#6b5b30','#26351d'];
    ctx.fillStyle=colors[0];ctx.fillRect(0,0,64,64);
    for(let layer=1;layer<colors.length;layer++){ctx.fillStyle=colors[layer];for(let i=0;i<10;i++){const x=(i*19+layer*13)%64,y=(i*11+layer*23)%64,w=5+((i+layer*3)%11),h=4+((i*3+layer)%8);ctx.fillRect(x,y,w,h);}}
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,2);texture.magFilter=THREE.NearestFilter;return texture;
}
function character(color,customization={}) {
const custom=Object.assign({hairStyle:'default',hairColor:'#38322c',skinColor:'#ceaa88',clothingColor:color,pantsColor:'#60665c',shoesColor:'#303637',bodyType:'standard',topType:'jacket',faceType:'calm',gearType:'none',headwearType:'none',armorType:'none',neckwearType:'none',armorColor:'#303b42',neckwearColor:'#8b1820',beltColor:'#5a3823'},customization||{});
const isCamo=custom.gearType==='camo1'||custom.gearType==='camo2',uniformMap=isCamo?camoTexture(custom.gearType):null;
const isTShirt=custom.topType==='tshirt';
const mats = {shirt:material(isCamo?'#ffffff':custom.clothingColor),pants:material(isCamo?'#ffffff':custom.pantsColor),seam:material('#354b44'),skin:material(custom.skinColor),hair:material(custom.hairColor),headwear:material(isCamo?'#ffffff':custom.hairColor),boot:material(custom.shoesColor),sole:material('#202526'),eye:material('#151918'),mouth:material('#431c20'),joint:material('#c68432',.45),armor:material(isCamo?'#ffffff':custom.armorColor),neckwear:material(custom.neckwearColor),belt:material(custom.beltColor)};
if(uniformMap){[mats.shirt,mats.pants,mats.headwear,mats.armor].forEach(mat=>{mat.map=uniformMap;mat.needsUpdate=true;});}
const profiles={slim:{torso:.84,depth:.86,limb:.82,hip:.86,head:.95},standard:{torso:1,depth:1,limb:1,hip:1,head:1},athletic:{torso:1.14,depth:1.08,limb:1.04,hip:1.03,head:.96},heavy:{torso:1.24,depth:1.2,limb:1.16,hip:1.16,head:1.04},tall:{torso:.94,depth:.93,limb:.9,hip:.94,head:.88},compact:{torso:1.06,depth:1.05,limb:1.03,hip:1.05,head:1.12}};
const p=profiles[custom.bodyType]||profiles.standard,hairParts=[],gearParts=[];
const accessory=(parent)=>{const group=pivot(parent);group.userData.isCharacterAccessory=true;return group;};

    const root=new THREE.Group();const pelvis=pivot(root);const waist=pivot(pelvis,0,.20,0);const chest=pivot(waist);
    shaped(pelvis,[[-.14,.40*p.hip,.27*p.depth],[0,.46*p.hip,.30*p.depth],[.17,.43*p.hip,.28*p.depth]],mats.pants);
    shaped(chest,[[-.04,.40*p.torso,.26*p.depth],[.12,.43*p.torso,.26*p.depth],[.23,.45*p.torso,.28*p.depth]],mats.shirt);
    shaped(chest,[[.12,.43*p.torso,.28*p.depth],[.42,.58*p.torso,.31*p.depth],[.65,.66*p.torso,.29*p.depth],[.74,.47*p.torso,.25*p.depth]],mats.shirt);
    box(pelvis,.445*p.hip,.065,.295*p.depth,mats.belt,0,.14,0);box(pelvis,.09,.06,.015,mats.joint,0,.14,.156*p.depth);
    if(!isTShirt){
        const jacketFront=.153*p.depth;
        box(chest,.019,.46,.014,mats.seam,0,.40,jacketFront);
        [-1,1].forEach(s=>{box(chest,.16*p.torso,.14,.024,mats.shirt,s*.165*p.torso,.47,jacketFront+.007);box(chest,.16*p.torso,.026,.029,mats.seam,s*.165*p.torso,.53,jacketFront+.009);});
    }
    mesh(chest,new THREE.CylinderGeometry(.086,.094,.14,10),mats.skin,V(0,.79,0));
    const head=pivot(chest,-.065,1.0225,0);
    const hs=p.head;
    shaped(head,[[-.1875,.16*hs,.20*hs],[-.12,.245*hs,.265*hs],[.025,.285*hs,.28*hs],[.145,.27*hs,.26*hs],[.1875,.21*hs,.215*hs]],mats.skin);
    const expressions={
        calm:{eyeW:.052,eyeH:.018,eyeY:.014,eyeTilt:0,browY:.055,browTilt:0,mouthY:-.102,mouthTilt:0,mouthW:.04},
        focused:{eyeW:.047,eyeH:.014,eyeY:.022,eyeTilt:.22,browY:.062,browTilt:.20,mouthY:-.105,mouthTilt:-.07,mouthW:.036},
        stern:{eyeW:.048,eyeH:.019,eyeY:.012,eyeTilt:-.36,browY:.052,browTilt:0,browH:.024,mouthY:-.112,mouthTilt:.24,mouthW:.042},
        sharp:{eyeW:.044,eyeH:.014,eyeY:.026,eyeTilt:.48,browY:.069,browTilt:.55,mouthY:-.098,mouthTilt:-.10,mouthW:.032},
        wide:{eyeW:.065,eyeH:.027,eyeY:.018,eyeTilt:.10,browY:.074,browTilt:.18,mouthY:-.108,mouthTilt:.38,mouthW:.043}
    };
    const expression=expressions[custom.faceType]||expressions.calm;
    [-1,1].forEach(s=>{const eye=box(head,expression.eyeW,expression.eyeH,.014,mats.eye,s*.066*hs,expression.eyeY,.144*hs);eye.rotation.z=s*expression.eyeTilt;const brow=box(head,.064,expression.browH||.015,.015,mats.hair,s*.066*hs,expression.browY,.143*hs);brow.rotation.z=s*expression.browTilt;box(head,.035,.078,.058,mats.skin,s*.143*hs,-.015,0);const mouth=box(head,expression.mouthW+.005,.015,.016,mats.mouth,s*.024,expression.mouthY,.146*hs);mouth.rotation.z=s*expression.mouthTilt;});
    box(head,.035,.06,.042,mats.skin,0,-.019,.146*hs);
    const headwear=custom.headwearType||'none';
    if(headwear==='none'&&custom.hairStyle!=='bald'){
        const hair=accessory(head);hairParts.push(hair);
        if(custom.hairStyle==='long'){const afro=sphere(hair,.25*hs,mats.hair);afro.position.set(0,.145,-.075);afro.scale.set(1.15,1.02,1.1);}
        else if(custom.hairStyle==='spiky'){for(let i=0;i<6;i++){const z=-.135+i*.054;const spike=mesh(hair,new THREE.ConeGeometry(.057*hs,.19*hs,6),mats.hair,V(0,.215-Math.abs(i-2.5)*.006,z));spike.rotation.x=(i-2.5)*.035;}}
        else if(custom.hairStyle==='sidepart'){const a=box(hair,.205*hs,.095,.30*hs,mats.hair,-.05,.15,-.01),b=box(hair,.125*hs,.13,.29*hs,mats.hair,.10,.165,-.01);a.rotation.z=.13;b.rotation.z=-.08;box(hair,.27*hs,.16,.07,mats.hair,0,.065,-.135*hs);}
        else if(custom.hairStyle==='short'){
            // Flat military cut: a low squared crown with closely clipped sides and back.
            box(hair,.292*hs,.076*hs,.266*hs,mats.hair,0,.184*hs,-.008*hs);
            box(hair,.040*hs,.116*hs,.236*hs,mats.hair,-.137*hs,.112*hs,-.012*hs);
            box(hair,.040*hs,.116*hs,.236*hs,mats.hair,.137*hs,.112*hs,-.012*hs);
            box(hair,.284*hs,.126*hs,.048*hs,mats.hair,0,.105*hs,-.135*hs);
        }
        else shaped(hair,[[.055,.315*hs,.31*hs],[.145,.30*hs,.292*hs],[.215,.235*hs,.235*hs]],mats.hair);
    }
    if(headwear!=='none'){
        const hat=accessory(head);gearParts.push(hat);
        if(headwear==='helmet'){
            const size=.285*hs;hat.position.y=size*.16;hat.rotation.x=-.2;hat.scale.setScalar(.95);
            const dome=mesh(hat,new THREE.SphereGeometry(size*.78,18,10,0,Math.PI*2,0,Math.PI*.56),mats.headwear,V(0,size*.18,0));dome.scale.set(1.04,.68,1.1);
            const lowerRim=mesh(hat,new THREE.CylinderGeometry(size*.78,size*.84,size*.13,18),mats.headwear,V(0,size*.01,0));lowerRim.scale.set(1.03,1,1.14);
            const skirt=mesh(hat,new THREE.CylinderGeometry(size*.78,size*.9,size*.24,18,1,true,Math.PI*.26,Math.PI*1.48),mats.headwear,V(0,-size*.11,0));skirt.scale.set(1.02,1,1.14);skirt.rotation.x=-.08;
            const peak=mesh(hat,new THREE.SphereGeometry(size*.5,14,5,0,Math.PI*2,Math.PI*.44,Math.PI*.18),mats.headwear,V(0,size*.02,size*.56));peak.scale.set(1.18,.18,.38);
        }else{
            const crown=mesh(hat,new THREE.CylinderGeometry(.18*hs,.205*hs,.13,10),mats.headwear,V(0,.15,0));crown.scale.z=1.05;
            box(hat,.36*hs,.035,.25*hs,mats.headwear,0,.105,.12);
        }
    }
    if(custom.armorType&&custom.armorType!=='none'){
        const armor=accessory(chest);gearParts.push(armor);const heavy=custom.armorType==='heavy';
        shaped(armor,[[.15,.46*p.torso,.34*p.depth],[.39,(heavy?.61:.56)*p.torso,.36*p.depth],[.65,(heavy?.57:.52)*p.torso,.33*p.depth]],mats.armor);
        box(armor,.16,.22,.055,mats.armor,0,.39,.20*p.depth);
        if(heavy)[-1,1].forEach(s=>box(armor,.17,.11,.31,mats.armor,s*.31*p.torso,.61,0));
    }
    if(custom.neckwearType&&custom.neckwearType!=='none'){
        const neckwear=accessory(chest);gearParts.push(neckwear);
        if(custom.neckwearType==='tie'){const knot=box(neckwear,.075,.075,.027,mats.neckwear,0,.695,.172*p.depth);knot.rotation.z=Math.PI/4;shaped(neckwear,[[.67,.052,.026],[.32,.074,.027],[.22,.012,.027]],mats.neckwear);neckwear.children[neckwear.children.length-1].position.z=.172*p.depth;}
        else {const scarf=mesh(neckwear,new THREE.TorusGeometry(.115,.038,6,12),mats.neckwear,V(0,.76,0));scarf.rotation.x=Math.PI/2;}
    }
    // The character faces +Z: its anatomical right arm is on -X.
    const armMaterial=isTShirt?mats.skin:mats.shirt;
    const arms=[limb(chest,[-.35*p.torso,.67,0],.52,.48,.18*p.limb,armMaterial,armMaterial,mats.shirt),limb(chest,[.35*p.torso,.67,0],.52,.48,.18*p.limb,armMaterial,armMaterial,mats.shirt)];
    const [rightArm,leftArm]=arms;
    arms.forEach((arm,i)=>{box(arm.end,.115,.135,.12,mats.skin,0,.028,0);box(arm.end,.038,.088,.06,mats.skin,i===0?.07:-.07,.05,.01);});
    const legs=[limb(pelvis,[-.195*p.hip,0,0],.75,.70,.235*p.limb,mats.pants,mats.pants),limb(pelvis,[.195*p.hip,0,0],.75,.70,.235*p.limb,mats.pants,mats.pants)];
    legs.forEach(l=>{box(l.end,.195,.17,.34,mats.boot,0,-.035,.062);box(l.end,.20,.032,.35,mats.sole,0,-.104,.062);});
    const gun=pivot(chest);
    let weaponId='m1rifle',weaponVariant='A';
    function setWeapon(id,variant=weaponVariant){
        variant=['A','B','C'].includes(String(variant).toUpperCase())?String(variant).toUpperCase():'A';
        if(!weaponProfiles[id] || (id===weaponId&&variant===weaponVariant&&gun.children.length))return;
        const materials=new Set();gun.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());
        gun.clear();weaponId=id;weaponVariant=variant;weaponGeometry(gun,id,variant);
    }
    setWeapon(weaponId);
    const markers=[];
    function pose(mode,t) {
        let hipY=1.57, hipZ=0, lean=.035;
        let feet=[V(-.285,.12,.12),V(.285,.12,-.1)];
        if(mode==='crouch'){hipY=.91;hipZ=-.23;lean=.20;feet=[V(-.25,.12,.25),V(.25,.12,-.09)];}
        if(mode==='run'){
            const phase=t*9.2;
            hipY=1.43+.055*Math.cos(phase*2);lean=.185;
            // The lifted foot travels forward; the planted foot drives backward.
            feet=[0,Math.PI].map((offset,i)=>{
                const p=phase+offset;
                const stride=Math.sin(p);
                const lift=Math.max(0,Math.cos(p));
                return V(i===0?-.20:.20,.12+lift*.31,stride*.68);
            });
        }
        pelvis.position.set(0,hipY,hipZ);pelvis.rotation.x=mode==='run'?.055:0;waist.rotation.x=lean;chest.rotation.set(0,0,0);
        const breathing=mode==='run'?Math.sin(t*8)*.009:Math.sin(t*2)*.006;
        const profile=weaponProfiles[weaponId];
        gun.position.fromArray(profile.position);gun.position.y+=breathing;
        gun.rotation.x=-lean;
        head.position.x=profile.head[0];head.rotation.set(-lean+.07,profile.head[1],profile.head[2]);
        const right=V(...profile.right).applyEuler(gun.rotation).add(gun.position);
        const left=V(...profile.left).applyEuler(gun.rotation).add(gun.position);
        solve(rightArm,right,V(...(profile.rightPole||[-.69,-.10,.10])));solve(leftArm,left,V(...(profile.leftPole||[.65,-.12,.3])));
        if(weaponId==='pistol')leftArm.end.rotation.z=-.22;
        legs.forEach((leg,i)=>solve(leg,feet[i].clone().sub(pelvis.position),V(i===0?-.25:.25,-.30,1.55)));
        if(mode==='run'){
            const phase=t*9.2;
            legs.forEach((leg,i)=>{
                const p=phase+(i===0?0:Math.PI);
                leg.end.rotation.x+=THREE.MathUtils.clamp(-Math.sin(p)*.18-Math.max(0,Math.cos(p))*.12,-.24,.2);
            });
        }

    }
    return {root,pelvis,waist,chest,head,arms,legs,gun,markers,pose,setWeapon,shirt:mats.shirt,hairParts,gearParts,get weapon(){return weaponId}};
}

const rigs=new WeakMap(),gunRigs=new WeakMap(),activeRagdolls=new Set();
const activeRecoils=new Set();
const activeHitReactions=new Set();
function create(color,customization){
    const r=character(color,customization);r.pose('stand',0);
    const aim=pivot(r.chest);
    [r.head,r.arms[0].root,r.arms[1].root,r.gun].forEach(o=>aim.add(o));
    r.aim=aim;r.mode='stand';r.time=0;
    const parts={modernRig:true,body:r.chest.children.find(o=>o.isMesh&&o.geometry.attributes.position.count>24),head:r.head,waist:r.pelvis,torso:r.chest,aimGroup:aim,gun:r.gun,baseTorsoPosePitch:0,
        leftArm:r.arms[1].root,rightArm:r.arms[0].root,leftElbow:r.arms[1].bend,rightElbow:r.arms[0].bend,leftForearm:r.arms[1].bend,rightForearm:r.arms[0].bend,leftHand:r.arms[1].end,rightHand:r.arms[0].end,
        leftHip:r.legs[1].root,rightHip:r.legs[0].root,leftKnee:r.legs[1].bend,rightKnee:r.legs[0].bend,leftFoot:r.legs[1].end,rightFoot:r.legs[0].end,baseHeadY:r.head.position.y,baseAimY:0,hairParts:r.hairParts,gearParts:r.gearParts};
    r.root.userData.parts=parts;r.root.userData.footOffset=0;r.root.userData.hairParts=r.hairParts;r.root.userData.gearParts=r.gearParts;
    r.gun.userData.modernWeapon=true;rigs.set(parts,r);gunRigs.set(r.gun,r);
    r.hitReaction=null;r.hitReactionSide=1;
    // Body meshes stay fixed across weapon changes; never include the detachable gun.
    r.colliders=[];
    r.root.traverse(o=>{if(!o.isMesh||!o.geometry)return;let p=o;while(p){if(p===r.gun||p.userData.isCharacterAccessory)return;p=p.parent;}const meshes=[];o.traverse(m=>{if(m.isMesh&&m.geometry){if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();meshes.push(m);}});r.colliders.push({meshes,box:new THREE.Box3()});});
    r.colliderBoxes=r.colliders.map(c=>c.box);r.scratchBox=new THREE.Box3();
    return r.root;
}
function setWeapon(gun,id,variant='A'){const r=gunRigs.get(gun);if(!r)return;r.setWeapon(id||'pistol',variant);}
function createWeapon(id='pistol',variant='A'){const gun=new THREE.Group();gun.userData.modernWeapon=true;weaponGeometry(gun,weaponProfiles[id]?id:'pistol',variant);return gun;}
function adopt(actor){const r=rigs.get(actor.userData.parts);if(r)r.root=actor;}
function pose(parts,crouch,time,moving,lowerYaw=0){
    const r=rigs.get(parts);if(!r)return;
    if(r.gun.parent!==r.aim)r.aim.add(r.gun);
    r.mode=crouch?'crouch':moving?'run':'stand';r.time=time||0;r.pose(r.mode,r.time);
    if(crouch&&moving){
        const phase=r.time*10.5;
        r.pelvis.position.y=.91+Math.cos(phase*2)*.018;
        const feet=[0,Math.PI].map((offset,i)=>{
            const p=phase+offset;
            const stride=Math.sin(p);
            const lift=Math.max(0,Math.cos(p));
            return V(i===0?-.25:.25,.12+lift*.13,.08+stride*.30);
        });
        r.legs.forEach((l,i)=>{
            solve(l,feet[i].sub(r.pelvis.position),V(i===0?-.25:.25,-.30,1.4));
            const p=phase+(i===0?0:Math.PI);
            l.end.rotation.x+=THREE.MathUtils.clamp(-Math.sin(p)*.12-Math.max(0,Math.cos(p))*.08,-.18,.14);
        });
    }
    const yaw=THREE.MathUtils.clamp(lowerYaw,-1.22,1.22);
    if(moving&&yaw!==0){const axis=V(0,1,0);const feet=r.legs.map(l=>r.root.worldToLocal(l.end.getWorldPosition(V())).applyAxisAngle(axis,yaw));r.legs.forEach((l,i)=>solve(l,feet[i].sub(r.pelvis.position),V(i===0?-.25:.25,-.30,1.4).applyAxisAngle(axis,yaw)));}
    if(r.hitReaction){
        const h=r.hitReaction,x=h.elapsed/h.duration;
        let amount=0;
        if(x>=0&&x<.11)amount=Math.sin((x/.11)*Math.PI*.5);
        else if(x<1)amount=Math.exp(-(x-.11)*6.2)*(.78+.22*Math.cos((x-.11)*Math.PI*7));
        if(amount>0){
            const bend=amount*h.strength;
            const shudder=Math.sin(h.elapsed*58)*Math.exp(-h.elapsed*7)*h.strength;
            r.pelvis.rotation.x+=bend*.075;
            r.waist.rotation.x+=bend*.24;
            r.head.rotation.x+=bend*.11;
            r.head.rotation.z+=h.side*shudder*.045;
            r.arms[0].root.rotation.z-=h.side*shudder*.035;
            r.arms[1].root.rotation.z+=h.side*shudder*.035;
            r.legs[0].root.rotation.x+=bend*.035;
            r.legs[1].root.rotation.x+=bend*.035;
        }
    }
    if(r.recoilAmount>0)r.waist.rotation.x-=r.recoilAmount;
    parts.baseTorsoPosePitch=r.chest.rotation.x;
    r.root.scale.y=1;r.root.updateMatrixWorld(true);
}
function reset(parts,id){const r=rigs.get(parts);if(!r)return;activeRagdolls.delete(r);activeRecoils.delete(r);activeHitReactions.delete(r);r.death=null;r.recoilAmount=0;r.hitReaction=null;if(r.gun.parent!==r.aim)r.aim.add(r.gun);r.gun.position.set(0,0,0);r.gun.rotation.set(0,0,0);r.gun.scale.set(1,1,1);r.aim.rotation.set(0,0,0);r.pelvis.rotation.set(0,0,0);r.waist.rotation.set(0,0,0);r.chest.rotation.set(0,0,0);r.arms.forEach(l=>l.end.rotation.set(0,0,0));r.legs.forEach(l=>l.end.rotation.set(0,0,0));if(id)r.setWeapon(id);pose(parts,false,0,false);r.gun.visible=true;}
// Reuse bounds, but update their coordinates on every call (including death/respawn).
function boxes(parts){const r=rigs.get(parts);if(!r)return [];r.root.updateWorldMatrix(true,true);for(const c of r.colliders){c.box.makeEmpty();for(const m of c.meshes)c.box.union(r.scratchBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));}return r.colliderBoxes;}
function bodyBox(parts){const b=new THREE.Box3();boxes(parts).forEach(x=>b.union(x));return b;}
const muzzleEnds={pistol:[0,.01,.308],m1rifle:[0,.026,1.015],machinegun:[0,.024,.817],sniperrifle:[0,.03,1.215],shotgun:[0,.025,.711],rocketlauncher:[0,0,.85]};
function muzzle(parts){const r=rigs.get(parts);r.gun.updateWorldMatrix(true,false);return {position:V(...muzzleEnds[r.weapon]).applyMatrix4(r.gun.matrixWorld),direction:V(0,0,1).transformDirection(r.gun.matrixWorld)};}
function aim(parts,direction){
    const r=rigs.get(parts);if(!r||!direction||direction.lengthSq()<1e-8)return;
    // Head, arms and gun remain rigidly attached to the chest. Rotate that
    // complete hierarchy by the exact world-space correction required for the
    // barrel to match the requested direction.
    r.aim.quaternion.identity();
    r.root.updateWorldMatrix(true,true);
    const currentDirection=V(0,0,1).transformDirection(r.gun.matrixWorld);
    const desiredDirection=direction.clone().normalize();
    const correction=new THREE.Quaternion().setFromUnitVectors(currentDirection,desiredDirection);
    const currentWorld=r.chest.getWorldQuaternion(new THREE.Quaternion());
    const desiredWorld=correction.multiply(currentWorld);
    const parentWorld=r.chest.parent.getWorldQuaternion(new THREE.Quaternion());
    r.chest.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
    r.root.updateWorldMatrix(true,true);
}
function beginRagdoll(parts,impactVelocity=null,hitPoint=null,seed=Math.random()){
    const r=rigs.get(parts);if(!r)return;
    activeRecoils.delete(r);activeHitReactions.delete(r);r.recoilAmount=0;r.hitReaction=null;
    let n=seed*100;const random=()=>{n+=1;const s=Math.sin(n*78.233)*43758.5453;return s-Math.floor(s);};
    r.root.updateWorldMatrix(true,true);
    const worldParent=r.root.parent;
    if(worldParent)worldParent.attach(r.gun);else r.root.attach(r.gun);
    const aimRotation=r.aim.quaternion.clone();
    [r.head,r.arms[0].root,r.arms[1].root].forEach(object=>object.quaternion.premultiply(aimRotation));
    r.aim.quaternion.identity();
    r.root.updateWorldMatrix(true,true);
    const inverseRoot=r.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const force=impactVelocity&&impactVelocity.lengthSq()>1e-6?impactVelocity.clone().normalize():V((random()-.5)*.3,0,1);
    const localForce=force.clone().applyQuaternion(inverseRoot).setY(0);if(localForce.lengthSq()<1e-6)localForce.set(0,0,1);localForce.normalize();
    const localHit=hitPoint?r.root.worldToLocal(hitPoint.clone()):V((random()-.5)*.5,1.65,0);
    const zone=localHit.y>2.42?'head':localHit.y>1.42?'torso':'legs';
    const hitLeft=localHit.x>0;
    const channels=[];
    const add=(object,x,y,z,delay=0,settle=.35)=>{
        if(!object)return;
        const start=object.quaternion.clone();
        const primary=new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'XYZ'));
        const secondary=new THREE.Quaternion().setFromEuler(new THREE.Euler(
            jitter()*settle,jitter()*settle*.75,jitter()*settle,'XYZ'
        ));
        const mid=start.clone().multiply(primary);
        channels.push({object,start,mid,target:mid.clone().multiply(secondary),delay});
    };
    const side=localForce.x,forward=localForce.z,jitter=()=>random()-.5;
    add(r.pelvis,forward*.24+jitter()*.32,side*.20+jitter()*.22,-side*.30+jitter()*.34,0,.32);
    add(r.waist,forward*.42+jitter()*.34,side*.30+jitter()*.25,-side*.48+jitter()*.36,0,.42);
    add(r.head,THREE.MathUtils.clamp(forward*(zone==='head'?.32:.18)+jitter()*.16,-.38,.38),THREE.MathUtils.clamp(side*.18+jitter()*.14,-.3,.3),THREE.MathUtils.clamp(-side*(zone==='head'?.28:.16)+jitter()*.16,-.34,.34),0,.18);
    r.arms.forEach((arm,i)=>{
        const struck=zone==='torso'&&((i===1)===hitLeft);const s=i===0?-1:1;
        add(arm.root,-.52-random()*.92+forward*(struck?.55:.16),side*.30+jitter()*.26,s*(.30+random()*.72)-side*(struck?.58:.16),0,.68);
        add(arm.bend,-.30-random()*1.02,jitter()*.38,s*jitter()*.46,.015+i*.008,.62);
        add(arm.end,jitter()*.68,jitter()*.55,jitter()*.82,.025+i*.008,.58);
    });
    r.legs.forEach((leg,i)=>{
        const struck=zone==='legs'&&((i===1)===hitLeft);const s=i===0?-1:1;
        add(leg.root,forward*(struck?.78:.30)+jitter()*.46,side*.22+jitter()*.20,s*(.12+random()*.38)-side*(struck?.48:.10),.02+i*.008,.52);
        add(leg.bend,.22+random()*(struck?1.12:.76),jitter()*.25,s*jitter()*.24,.035+i*.008,.50);
        add(leg.end,jitter()*.46,jitter()*.32,jitter()*.38,.05+i*.008,.44);
    });
    const gunStart=r.gun.position.clone();
    const gunVelocity=force.clone().multiplyScalar(.9).add(V(jitter()*.7,1.05+random()*.35,jitter()*.7));
    const gunStartQuat=r.gun.quaternion.clone();
    const gunEndQuat=new THREE.Quaternion().setFromEuler(new THREE.Euler(
        jitter()*.16,random()*Math.PI*2,random()*Math.PI*2,'XYZ'
    ));
    const rootWorldY=r.root.getWorldPosition(V()).y;
    const gunFloorY=rootWorldY+.04;
    r.death={elapsed:0,duration:1.48,channels,gunStart,gunVelocity,gunStartQuat,gunEndQuat,gunFloorY,gunBox:new THREE.Box3(),gunLanded:false,localForce,zone};activeRagdolls.add(r);
}
function update(delta){
    const dt=Math.min(Math.max(delta||0,0),.05);
    for(const r of activeHitReactions){
        const h=r.hitReaction;
        if(!h||r.death){r.hitReaction=null;activeHitReactions.delete(r);continue;}
        h.elapsed+=dt;
        if(h.elapsed>=h.duration){r.hitReaction=null;activeHitReactions.delete(r);}
    }
    for(const r of activeRecoils){
        r.recoilAmount*=Math.exp(-15*dt);
        if(r.recoilAmount<.002){r.recoilAmount=0;activeRecoils.delete(r);}
    }
    for(const r of activeRagdolls){
        const d=r.death;if(!d){activeRagdolls.delete(r);continue;}d.elapsed+=dt;
        for(const c of d.channels){
            const p=THREE.MathUtils.clamp((d.elapsed-c.delay)/(d.duration-c.delay),0,1);
            if(p<.42){
                const eased=1-Math.pow(1-p/.42,3);
                c.object.quaternion.slerpQuaternions(c.start,c.mid,eased);
            }else{
                const eased=1-Math.pow(1-(p-.42)/.58,2);
                c.object.quaternion.slerpQuaternions(c.mid,c.target,eased);
            }
        }
        if(!d.gunLanded){
            d.gunVelocity.y-=9.8*dt;
            r.gun.position.addScaledVector(d.gunVelocity,dt);
            const turn=THREE.MathUtils.clamp(d.elapsed/.7,0,1);
            r.gun.quaternion.slerpQuaternions(d.gunStartQuat,d.gunEndQuat,1-Math.pow(1-turn,3));
            r.gun.updateWorldMatrix(true,true);
            const gunBox=d.gunBox.setFromObject(r.gun);
            if(gunBox.min.y<=d.gunFloorY){
                r.gun.position.y+=d.gunFloorY-gunBox.min.y;
                if(d.gunVelocity.y<-.7){
                    d.gunVelocity.y*=-.16;
                    d.gunVelocity.x*=.68;d.gunVelocity.z*=.68;
                }else{
                    d.gunVelocity.set(0,0,0);
                    d.gunLanded=true;
                }
            }
        }
        if(d.elapsed>=d.duration){
            r.gun.quaternion.copy(d.gunEndQuat);
            r.gun.updateWorldMatrix(true,true);
            const gunBox=d.gunBox.setFromObject(r.gun);
            if(gunBox.min.y<d.gunFloorY)r.gun.position.y+=d.gunFloorY-gunBox.min.y;
            activeRagdolls.delete(r);
        }
    }
}
function nudge(parts,impactVelocity=null){const r=rigs.get(parts);if(!r||!r.death)return;const f=impactVelocity&&impactVelocity.lengthSq()>1e-6?impactVelocity.clone().normalize():V(0,0,1);r.death.gunVelocity.add(f.multiplyScalar(.35));}
function recoil(parts,weapon='pistol'){
    const r=rigs.get(parts);if(!r||r.death)return;
    const strengths={pistol:.075,machinegun:.04,m1rifle:.09,sniperrifle:.13,shotgun:.16,rocketlauncher:.14};
    r.recoilAmount=Math.max(r.recoilAmount||0,strengths[weapon]||.075);
    activeRecoils.add(r);
}
function hitReaction(parts,impactVelocity=null,strength=1){
    const r=rigs.get(parts);if(!r||r.death)return;
    let side=-(r.hitReactionSide||1);r.hitReactionSide=side;
    if(impactVelocity&&impactVelocity.lengthSq()>1e-6){
        const inverseRoot=r.root.getWorldQuaternion(new THREE.Quaternion()).invert();
        const localImpact=impactVelocity.clone().normalize().applyQuaternion(inverseRoot);
        if(Math.abs(localImpact.x)>.08)side=localImpact.x>0?1:-1;
    }
    r.hitReaction={elapsed:0,duration:.72,strength:THREE.MathUtils.clamp(strength,.65,1.3),side};
    activeHitReactions.add(r);
}
function loose(parts,seed){beginRagdoll(parts,null,null,seed);}
return {create,createWeapon,setWeapon,pose,reset,bodyBox,boxes,muzzle,aim,loose,beginRagdoll,update,nudge,recoil,hitReaction,adopt};

})();
